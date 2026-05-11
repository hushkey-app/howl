import { getBuildCache, Howl, type ListenOptions } from "../core/app.ts";
import { Builder, type BuildOptions } from "./builder.ts";
import { cssModulesPlugin } from "./plugins/css_modules.ts";
import * as path from "@std/path";
import type { AnyApiDefinition, HowlApiConfig } from "../api/types.ts";
import { buildApiCommands } from "../api/api-handler.ts";
import type { ApiEntry } from "./dev_build_cache.ts";

/**
 * Options accepted by {@linkcode HowlBuilder}. Extends {@linkcode BuildOptions}
 * minus the per-client directory fields (resolved per registered client).
 */
export interface HowlDevOptions<State = any>
  extends Omit<BuildOptions, "routeDir" | "islandDir" | "staticDir"> {
  /**
   * Lazy app loader — invoked when the dev server starts. Accepts either the
   * {@linkcode Howl} instance directly or a `{ app }` module shape so users can
   * `import("./main.ts")` without restructuring exports.
   */
  importApp?: () => Promise<Howl<State> | { app: Howl<State> }> | Howl<State>;
}

/**
 * Wraps Builder with Howl-aware features:
 * - CSS Modules baked in
 * - React → Preact/compat alias baked in
 * - apis/ directory crawled automatically when app.fsApiRoutes() is called
 * - OpenAPI spec auto-exposed at /api/docs
 */
export class HowlBuilder<State = any> {
  #howl: Howl<State>;
  #options: HowlDevOptions<State>;
  #builders: Map<string, Builder<State>> = new Map();
  #apis: AnyApiDefinition[] = [];
  #apiEntries: ApiEntry[] = [];

  /** Build a {@linkcode HowlBuilder} bound to the given app and options. */
  constructor(howl: Howl<State>, options: HowlDevOptions<State> = {}) {
    this.#howl = howl;
    this.#options = options;
    this.#setupBuilders();
  }

  #defaultAlias(): Record<string, string> {
    return {
      "react": "npm:preact/compat",
      "react-dom": "npm:preact/compat",
      "react/jsx-runtime": "npm:preact/jsx-runtime",
      "react/jsx-dev-runtime": "npm:preact/jsx-dev-runtime",
    };
  }

  #makeBuilderOptions(overrides: Partial<BuildOptions> = {}): BuildOptions {
    return {
      ...this.#options,
      alias: {
        ...this.#defaultAlias(),
        ...this.#options.alias,
      },
      plugins: [
        cssModulesPlugin(),
        ...(this.#options.plugins ?? []),
      ],
      ...overrides,
    };
  }

  #setupBuilders() {
    const clients = this.#howl.getClients();

    if (clients.length === 0) {
      this.#builders.set(
        "default",
        new Builder<State>(this.#makeBuilderOptions({
          routeDir: "pages",
        })),
      );
      return;
    }

    for (const client of clients) {
      this.#builders.set(
        client.name,
        new Builder<State>(this.#makeBuilderOptions({
          routeDir: `${client.dir}/pages`,
          islandDir: `${client.dir}/islands`,
          staticDir: `${client.dir}/static`,
          outDir: `${this.#options.outDir ?? "_howl"}/${client.name}`,
        })),
      );
    }
  }

  // --- API crawling ---

  async #crawlApis(): Promise<void> {
    if (!this.#howl.isApiRoutesEnabled()) return;

    const root = this.#options.root ?? Deno.cwd();
    // When serverEntry is provided (e.g. ./server/main.ts) look for apis/
    // inside that directory rather than project root.
    const serverEntry = this.#options.serverEntry;
    const serverBase = serverEntry
      ? path.dirname(
        path.isAbsolute(serverEntry) ? serverEntry : path.join(root, serverEntry),
      )
      : root;
    const apisDir = path.join(serverBase, "apis");

    try {
      const stat = await Deno.stat(apisDir);
      if (!stat.isDirectory) return;
    } catch {
      // no apis/ folder — skip silently
      return;
    }

    await this.#walkApis(apisDir);

    if (this.#apis.length > 0) {
      // deno-lint-ignore no-console
      console.debug(`_ Found ${this.#apis.length} API definitions in apis/`);
    }
  }

  async #walkApis(dir: string, root = dir): Promise<void> {
    const entries: Deno.DirEntry[] = [];
    for await (const entry of Deno.readDir(dir)) {
      entries.push(entry);
    }

    // Static files (no brackets) before dynamic files ([param]), directories last
    entries.sort((a, b) => {
      const isDynA = a.isDirectory || /\[.+\]/.test(a.name);
      const isDynB = b.isDirectory || /\[.+\]/.test(b.name);
      if (isDynA === isDynB) return a.name.localeCompare(b.name);
      return isDynA ? 1 : -1;
    });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory) {
        await this.#walkApis(fullPath, root);
      } else if (entry.name.endsWith(".api.ts")) {
        try {
          const mod = await import(path.toFileUrl(fullPath).href);
          if (mod.default) {
            const api = mod.default as AnyApiDefinition;
            const fsPath = this.#inferFsPath(fullPath, root);
            const needsOverride = !!(fsPath && !api.path);
            this.#apis.push(needsOverride ? { ...api, path: fsPath } : api);
            this.#apiEntries.push({
              filePath: fullPath,
              overridePath: needsOverride ? fsPath : null,
            });
          }
        } catch (err) {
          // deno-lint-ignore no-console
          console.error(`_ Failed to load API: ${fullPath}`, err);
        }
      }
    }
  }

  /**
   * Infer a route path from the file system path.
   * The filesystem is the authoritative source — explicit `path` in the
   * definition always wins; `directory + name` auto-generation is bypassed.
   *
   * `[param]` segments become `:param`; `index.api.ts` maps to the folder.
   *
   * @example
   * apis/admin/[table]/index.api.ts   → /api/admin/:table
   * apis/admin/[table]/[id].api.ts    → /api/admin/:table/:id
   * apis/admin/[table]/restore.api.ts → /api/admin/:table/restore
   * apis/public/ping.api.ts           → /api/public/ping
   * apis/authentication/oauth/callback.api.ts → /api/authentication/oauth/callback
   */
  #inferFsPath(fullPath: string, apisDir: string): string | null {
    const rel = path.relative(apisDir, fullPath).replace(/\\/g, "/");
    const segments = rel.split("/");

    // Strip .api.ts from last segment; drop if it's "index"
    const last = segments[segments.length - 1].replace(/\.api\.ts$/, "");
    if (last === "index") {
      segments.pop();
    } else {
      segments[segments.length - 1] = last;
    }

    const converted = segments.map((s) => s.replace(/^\[(.+)\]$/, ":$1"));
    return `/api/${converted.join("/")}`;
  }

  #registerApis(app: Howl<State>): void {
    if (!this.#howl.isApiRoutesEnabled()) return;
    if (this.#apis.length === 0) return;

    const config = (app.getApiConfig() ?? null) as
      | HowlApiConfig<State, string>
      | null;
    const commands = buildApiCommands(app, this.#apis, config);
    app.setApiRouteItems(commands);
  }

  // --- Public API ---

  /** Register an island specifier on every underlying builder. */
  registerIsland(specifier: string): void {
    for (const builder of this.#builders.values()) {
      builder.registerIsland(specifier);
    }
  }

  /**
   * Start the dev server. Crawls `apis/` first, then delegates to each
   * registered client builder; the first client owns the requested port.
   */
  async listen(options: ListenOptions = {}): Promise<void> {
    const { importApp } = this.#options;
    if (!importApp) {
      throw new Error(
        "HowlBuilder.listen() requires importApp in fullstack mode.",
      );
    }

    // Crawl apis/ before starting
    await this.#crawlApis();

    if (this.#builders.size === 1) {
      await this.#builders.values().next().value!.listen(async () => {
        const result = await Promise.resolve(importApp());
        const app = result instanceof Howl ? result : result.app;
        this.#registerApis(app);
        return app;
      }, options);
      return;
    }

    const clients = this.#howl.getClients();

    await Promise.all(
      Array.from(this.#builders.entries()).map(([name, builder]) => {
        const client = clients.find((c) => c.name === name)!;
        return builder.listen(
          async () => {
            const result = await Promise.resolve(importApp());
            const app = result instanceof Howl ? result : result.app;
            this.#registerApis(app);
            const clientApp = new Howl<State>({ basePath: client.mount });
            clientApp.mountApp(client.mount, app);
            return clientApp;
          },
          name === clients[0].name ? options : { port: 0 },
        );
      }),
    );
  }

  /**
   * Run a production build for every registered client and apply the
   * resulting snapshot to the underlying {@linkcode Howl} app.
   */
  async build(): Promise<void> {
    // Crawl apis/ before build
    await this.#crawlApis();

    const app = this.#howl;
    const ssgBuilders: Builder<State>[] = [];

    await Promise.all(
      Array.from(this.#builders.entries()).map(async ([name, builder]) => {
        const applySnapshot = await builder.build({
          mode: "production",
          apiEntries: this.#apiEntries,
        });
        applySnapshot(app);
        if (builder.getSsgPatterns().length > 0) ssgBuilders.push(builder);
        // deno-lint-ignore no-console
        console.log(`_ Built client: ${name}`);
      }),
    );

    // Register APIs for production
    this.#registerApis(app);

    // Prerender SSG routes — runs after the build cache and APIs are wired so
    // the app's handler can produce the same HTML a real request would.
    if (ssgBuilders.length > 0) {
      await this.#prerenderSsg(app, ssgBuilders);
    }
  }

  async #prerenderSsg(app: Howl<State>, ssgBuilders: Builder<State>[]): Promise<void> {
    const buildCache = getBuildCache(app);
    if (buildCache === null) return;

    const handler = app.handler();
    const patterns = new Set<string>();
    for (const builder of ssgBuilders) {
      for (const p of builder.getSsgPatterns()) patterns.add(p);
    }

    for (const pattern of patterns) {
      // Convert URL pattern back to a concrete pathname. Patterns with
      // params would need getStaticPaths-style enumeration — skip them in
      // this pass and surface a warning so the user knows the route fell
      // through to dynamic SSR.
      if (/:[A-Za-z_]/.test(pattern)) {
        // deno-lint-ignore no-console
        console.warn(
          `_ SSG: skipping dynamic pattern "${pattern}" — getStaticPaths not yet supported.`,
        );
        continue;
      }
      const pathname = pattern;
      const url = `http://ssg.local${pathname}`;
      try {
        const res = await handler(new Request(url));
        if (!res.ok) {
          // deno-lint-ignore no-console
          console.warn(
            `_ SSG: ${pathname} returned ${res.status} during prerender — falling back to dynamic SSR.`,
          );
          continue;
        }
        const html = await res.text();
        buildCache.ssgPages.set(pattern, html);
      } catch (err) {
        // deno-lint-ignore no-console
        console.warn(`_ SSG: failed to prerender ${pathname}:`, err);
      }
    }

    // Re-serialise the snapshot now that ssgPages has been populated so the
    // production runtime sees the prerendered HTML.
    for (const builder of ssgBuilders) {
      const bc = getBuildCache(app);
      if (bc !== null) await this.#rewriteSnapshot(builder, bc);
    }

    // deno-lint-ignore no-console
    console.log(`_ Prerendered ${buildCache.ssgPages.size} SSG route(s)`);
  }

  async #rewriteSnapshot(
    builder: Builder<State>,
    _buildCache: import("../core/build_cache.ts").BuildCache<State>,
  ): Promise<void> {
    // DiskBuildCache.flush walks the static dir + rewrites snapshot.js. It's
    // safe to call twice — the file maps are idempotent. After our
    // ssgPages update the second flush picks them up.
    // deno-lint-ignore no-explicit-any
    const cache = _buildCache as any;
    if (typeof cache.flush === "function") {
      await cache.flush();
    }
    void builder;
  }

  /**
   * Get a specific client's builder by name.
   * Useful for registering plugins like tailwindPlugin.
   *
   * @example
   * tailwindPlugin(builder.getBuilder("default")!);
   */
  getBuilder(name = "default"): Builder<State> | undefined {
    return this.#builders.get(name);
  }

  /**
   * Get all discovered API definitions.
   * Available after listen() or build() is called.
   * Useful for generating a typed HTTP client.
   */
  getApis(): AnyApiDefinition[] {
    return this.#apis;
  }
}
