import {
  fsAdapter,
  Howl,
  type ListenOptions,
  parseDirPath,
  pathToExportName,
  setBuildCache,
  TEST_FILE_PATTERN,
  UniqueNamer,
} from "../core/mod.ts";
import * as path from "@std/path";
import * as colors from "@std/fmt/colors";
import { bundleJs, bundleVueSsr, type HowlBundleOptions } from "./esbuild.ts";
import type { Plugin as EsbuildPlugin } from "esbuild";
import { liveReload } from "./middlewares/live_reload.ts";
import {
  cssAssetHash,
  FileTransformer,
  type OnTransformOptions,
  type TransformFn,
} from "./file_transformer.ts";
import {
  type ApiEntry,
  type DevBuildCache,
  DiskBuildCache,
  type FsRoute,
  MemoryBuildCache,
} from "./dev_build_cache.ts";
import { BUILD_ID } from "../utils/build-id.ts";
import { devErrorOverlay } from "./middlewares/error_overlay/middleware.ts";
import { automaticWorkspaceFolders } from "./middlewares/automatic_workspace_folders.ts";
import { checkDenoCompilerOptions } from "./check.ts";
import { crawlFsItem } from "./fs_crawl.ts";
import { type AotEntry, aotPlugin } from "./plugins/aot.ts";
import { findPartialBoundary } from "./partial_boundary.ts";
import { CommandType } from "../core/commands.ts";

/**
 * Options accepted by the {@linkcode Builder} constructor.
 */
export interface BuildOptions {
  /**
   * This sets the target environment for the generated code.
   * See https://esbuild.github.io/api/#target
   * @default ["chrome99", "firefox99", "safari15"]
   */
  target?: string | string[];
  /**
   * The root directory of the Howl project.
   * @default Deno.cwd()
   */
  root?: string;
  /**
   * Output directory for production builds.
   * @default "_howl"
   */
  outDir?: string;
  /**
   * Static files directory.
   * @default "static"
   */
  staticDir?: string;
  /**
   * Islands directory.
   * @default "islands"
   */
  islandDir?: string;
  /**
   * Routes directory.
   * @default "routes"
   */
  routeDir?: string;
  /**
   * Server entry point.
   * @default "main.ts"
   */
  serverEntry?: string;
  /**
   * Client entry point (e.g. `./client/pages/_app.ts`).
   * When set, `routeDir` and `islandDir` are resolved relative to its
   * grandparent directory (the "client root") instead of `root`.
   * For example, `./client/pages/_app.ts` → client root = `./client/`,
   * so pages crawl from `./client/pages` and islands from `./client/islands`.
   */
  clientEntry?: string;
  /**
   * File paths to ignore when crawling.
   */
  ignore?: RegExp[];
  /**
   * Production source map options.
   * See https://esbuild.github.io/api/#source-maps
   */
  sourceMap?: HowlBundleOptions["sourceMap"];
  /**
   * Alias map passed directly to esbuild.
   * Primary use case: React → Preact/compat shim.
   * @example
   * {
   *   "react": "npm:preact/compat",
   *   "react-dom": "npm:preact/compat",
   *   "react/jsx-runtime": "npm:preact/jsx-runtime",
   * }
   */
  alias?: Record<string, string>;
  /**
   * Additional esbuild plugins injected before the Deno resolver.
   * @example [cssModulesPlugin()]
   */
  plugins?: EsbuildPlugin[];
}

/**
 * Fully-resolved build configuration — every {@linkcode BuildOptions} field
 * with defaults filled in, plus runtime metadata like `mode` and `buildId`.
 */
export type ResolvedBuildConfig =
  & Required<Omit<BuildOptions, "sourceMap" | "plugins" | "clientEntry">>
  & {
    /** Optional client entry point. */
    clientEntry?: string;
    /** Active run mode — `development` enables HMR, error overlay, etc. */
    mode: "development" | "production";
    /** Stable build identifier used for cache busting. */
    buildId: string;
    /** esbuild source-map configuration. */
    sourceMap?: HowlBundleOptions["sourceMap"];
    /** Additional esbuild plugins. */
    plugins?: EsbuildPlugin[];
  };

/**
 * Lower-level build pipeline — drives esbuild, file transforms, FS crawling,
 * and the dev server. Most users should prefer {@linkcode HowlBuilder}, which
 * wraps `Builder` with project-aware defaults.
 */
// deno-lint-ignore no-explicit-any
export class Builder<State = any> {
  #transformer: FileTransformer;
  #addedInternalTransforms = false;
  /** Resolved build configuration. */
  config: ResolvedBuildConfig;
  #islandSpecifiers = new Set<string>();
  #vueIslandSpecifiers = new Set<string>();
  #fsRoutes: FsRoute<State>;
  #ready = Promise.withResolvers<void>();

  /** Construct a builder with the given options. Defaults are applied here. */
  constructor(options?: BuildOptions) {
    const root = parseDirPath(options?.root ?? ".", Deno.cwd());
    const serverEntry = parseDirPath(options?.serverEntry ?? "main.ts", root);
    const clientEntry = options?.clientEntry ? parseDirPath(options.clientEntry, root) : undefined;
    // When clientEntry is provided (e.g. ./client/pages/_app.ts) derive the
    // client root as its grandparent (./client/), so pages/islands resolve
    // there instead of project root.
    const clientBase = clientEntry ? path.dirname(path.dirname(clientEntry)) : root;
    const outDir = parseDirPath(options?.outDir ?? "_howl", root);
    const staticDir = parseDirPath(options?.staticDir ?? "static", root);
    const islandDir = parseDirPath(options?.islandDir ?? "islands", clientBase);
    const routeDir = parseDirPath(options?.routeDir ?? "routes", clientBase);

    this.#fsRoutes = { dir: routeDir, files: [], id: "default" };
    this.#transformer = new FileTransformer(fsAdapter, root);

    this.config = {
      serverEntry,
      clientEntry,
      target: options?.target ?? ["chrome99", "firefox99", "safari15"],
      root,
      outDir,
      staticDir,
      islandDir,
      routeDir,
      ignore: options?.ignore ?? [TEST_FILE_PATTERN],
      mode: "production",
      buildId: BUILD_ID,
      sourceMap: options?.sourceMap,
      alias: options?.alias ?? {},
      plugins: options?.plugins ?? [],
    };
  }

  /** Register an island module for inclusion in the client bundle. */
  registerIsland(specifier: string): void {
    this.#islandSpecifiers.add(specifier);
  }

  /** Register a static-file transform callback (CSS modules, image hashing, …). */
  onTransformStaticFile(
    options: OnTransformOptions,
    callback: TransformFn,
  ): void {
    this.#transformer.onTransform(options, callback);
  }

  /**
   * Start the dev server: imports the app, builds an in-memory cache, and
   * serves with live-reload + error overlay middleware installed.
   */
  async listen(
    importHowl: () => Promise<{ app: Howl<State> } | Howl<State>>,
    options: ListenOptions = {},
  ): Promise<void> {
    this.config.mode = "development";

    await this.#crawlFsItems();

    let app = await importHowl();
    if (!(app instanceof Howl) && "app" in app) {
      app = app.app;
    }
    this.assertEngineSelected(app);

    const buildCache = new MemoryBuildCache<State>(
      this.config,
      this.#fsRoutes,
      this.#transformer,
    );

    await buildCache.prepare();

    app.config.root = this.config.root;
    app.config.mode = "development";
    setBuildCache(app, buildCache, "development");

    const appHandler = app.handler();

    const devHowl = new Howl<State>(app.config)
      .use(liveReload())
      .use(devErrorOverlay())
      .use(automaticWorkspaceFolders(this.config.root))
      .use(async (ctx: any) => {
        await this.#ready.promise;
        return ctx.next();
      })
      .all("*", (ctx: any) => appHandler(ctx.req, ctx.info));

    devHowl.config.root = this.config.root;
    devHowl.config.mode = "development";
    setBuildCache(devHowl, buildCache, "development");

    await Promise.all([
      devHowl.listen(options),
      this.#build(buildCache, true),
    ]);
  }

  /**
   * Run a one-shot production build.
   *
   * Returns a callback that attaches the resulting build cache to a
   * {@linkcode Howl} instance.
   */
  async build(
    options?: {
      mode?: ResolvedBuildConfig["mode"];
      snapshot?: "disk" | "memory";
      apiEntries?: ApiEntry[];
    },
  ): Promise<(app: Howl<State>) => void> {
    this.config.mode = options?.mode ?? "production";

    await this.#crawlFsItems();

    const buildCache = options?.snapshot === "memory"
      ? new MemoryBuildCache(this.config, this.#fsRoutes, this.#transformer)
      : new DiskBuildCache(this.config, this.#fsRoutes, this.#transformer);

    if (options?.apiEntries) {
      buildCache.setApiEntries(options.apiEntries);
    }

    await this.#build(buildCache, this.config.mode === "development");
    await buildCache.prepare();

    return (app) => {
      setBuildCache(app, buildCache, app.config.mode);
    };
  }

  /**
   * Enforce explicit engine selection: when a client entry with page routes is
   * configured but the app registers no render engine, throw. Engines are
   * explicit — Howl has no implicit default — so a renderable app must select
   * one (`preactEngine()` / `vueEngine()` / `reactEngine()`). Backend-only apps
   * (no client entry, or no page routes) are unaffected. Call after the FS crawl
   * with the resolved app.
   */
  assertEngineSelected(app: Howl<State>): void {
    if (this.config.clientEntry === undefined) return;
    const hasPageRoutes = this.#fsRoutes.files.some(
      (f) => f.type === CommandType.Route || f.type === CommandType.Error,
    );
    if (!hasPageRoutes) return;
    if (Object.keys(app.config.engines).length > 0) return;
    throw new Error(
      `Howl: client entry "${this.config.clientEntry}" has page routes but no render ` +
        `engine is registered. Engines are explicit — select one on the Howl app:\n` +
        `  new Howl({ engines: { preact: preactEngine() } })  // or vueEngine() / reactEngine()`,
    );
  }

  /**
   * URL patterns of routes flagged for SSG (`___page.tsx` prefix). Returned
   * after {@linkcode build} has crawled the FS; an empty array otherwise.
   */
  getSsgPatterns(): string[] {
    return this.#fsRoutes.files
      .filter((f) => f.type === CommandType.Route && f.ssg)
      .map((f) => f.routePattern);
  }

  async #collectAotEntries(namer: UniqueNamer): Promise<Map<string, AotEntry>> {
    const entries = new Map<string, AotEntry>();

    const aotFiles = this.#fsRoutes.files.filter((f) => f.type === CommandType.Route && f.aot);
    if (aotFiles.length === 0) return entries;

    const appFile = this.#fsRoutes.files.find((f) => f.type === CommandType.App);
    const layoutsByDir = new Map<string, string>();
    for (const f of this.#fsRoutes.files) {
      if (f.type === CommandType.Layout) {
        layoutsByDir.set(path.dirname(f.filePath), f.filePath);
      }
    }

    const routeDir = this.config.routeDir;
    for (const page of aotFiles) {
      const layouts: string[] = [];
      let dir = path.dirname(page.filePath);
      while (true) {
        const layoutPath = layoutsByDir.get(dir);
        if (layoutPath) layouts.unshift(layoutPath);
        if (dir === routeDir) break;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }

      // Find the topmost file in the render chain that places `<Partial>`.
      // Files at or above it sit outside the partial in DOM (kept across AOT
      // navs) and must NOT be bundled into the chunk; files below it sit
      // inside the partial and must be bundled so AOT swaps reproduce what an
      // SSR partial response would carry.
      //
      // No partial → no client-side mount target. Skip chunk emission for
      // this route. The page still renders normally (SSR for `__`, prebuilt
      // HTML for `___`); client navigation to it falls through to a full
      // document load, same as a regular SSR route. We only warn at build
      // time so apps that intentionally drop `client-nav` (and therefore
      // don't need chunks) stay quiet — those won't have a Partial either.
      const chain: string[] = [];
      if (appFile) chain.push(appFile.filePath);
      chain.push(...layouts);
      const boundary = await findPartialBoundary(fsAdapter, chain);
      if (boundary === null) continue;

      const appOffset = appFile ? 1 : 0;
      const trimmedLayouts = boundary.index < appOffset
        ? layouts
        : layouts.slice(boundary.index - appOffset + 1);

      const slug = page.routePattern.replace(/[^a-zA-Z0-9]+/g, "_") || "root";
      const name = namer.getUniqueName(`aot_${slug}`);

      entries.set(name, {
        name,
        routePattern: page.routePattern,
        pagePath: page.filePath,
        layouts: trimmedLayouts,
        appPath: appFile?.filePath ?? null,
      });
    }

    return entries;
  }

  async #crawlFsItems() {
    // Engine→extension map is declared by the registered engine plugins (e.g.
    // `vuePlugin` owns `.vue`, `reactPlugin` owns `.tsx`) — keeping engines out
    // of core. Unmapped extensions fall through to the built-in Preact renderer.
    const engineByExt: Record<string, string> = {};
    // Engine plugins declare their mapping under the shared `howl.engine` symbol
    // (a symbol so esbuild's plugin-option validation ignores it).
    const HOWL_ENGINE = Symbol.for("howl.engine");
    for (const p of this.config.plugins ?? []) {
      // deno-lint-ignore no-explicit-any
      const he = (p as any)[HOWL_ENGINE] as
        | { extensions: string[]; engine: string }
        | undefined;
      if (he !== undefined) { for (const ext of he.extensions) engineByExt[ext] = he.engine; }
    }
    const { islands, vueIslands, routes } = await crawlFsItem({
      islandDir: this.config.islandDir,
      routeDir: this.config.routeDir,
      ignore: this.config.ignore,
      engineByExt,
    });

    for (let i = 0; i < islands.length; i++) {
      this.registerIsland(islands[i]);
    }

    for (let i = 0; i < vueIslands.length; i++) {
      this.#vueIslandSpecifiers.add(vueIslands[i]);
    }

    this.#fsRoutes.files = routes;
  }

  async #build<T>(buildCache: DevBuildCache<T>, dev: boolean): Promise<void> {
    const { target, outDir, root } = this.config;
    const staticOutDir = path.join(outDir, "static");

    const hasClientArtifacts = this.#islandSpecifiers.size > 0 ||
      this.#vueIslandSpecifiers.size > 0 ||
      this.#fsRoutes.files.length > 0;

    await Deno.mkdir(outDir, { recursive: true });

    if (hasClientArtifacts) {
      const { denoJson, jsxImportSource } = await checkDenoCompilerOptions(root);

      if (!this.#addedInternalTransforms) {
        this.#addedInternalTransforms = true;
        cssAssetHash(this.#transformer);
      }

      try {
        await Deno.remove(staticOutDir, { recursive: true });
      } catch {
        // Ignore
      }

      // No base client runtime: engines (Vue/React) ship their own boot chunks.
      const entryPoints: Record<string, string> = {};

      const namer = new UniqueNamer();
      for (const spec of this.#islandSpecifiers) {
        const specName = specToName(spec);
        const name = namer.getUniqueName(specName);

        entryPoints[name] = spec;

        buildCache.islandModNameToChunk.set(name, {
          name,
          server: spec,
          browser: null,
          css: [],
        });
      }

      const aotEntries = await this.#collectAotEntries(namer);
      for (const entry of aotEntries.values()) {
        entryPoints[entry.name] = `aot:${entry.name}`;
      }

      // Vue islands: each `.island.vue` is bundled to a client chunk (compiled
      // by the user-supplied vuePlugin), plus the `@hushkey/howl-vue` boot
      // runtime once. `splitting` dedupes the shared `vue` runtime across them.
      const vueEntryToName = new Map<string, string>();
      let vueBootEntry = "";
      if (this.#vueIslandSpecifiers.size > 0) {
        for (const spec of this.#vueIslandSpecifiers) {
          const islandName = vueIslandName(spec);
          const name = namer.getUniqueName(`vue_${islandName}`);
          entryPoints[name] = spec;
          vueEntryToName.set(name, islandName);
        }
        vueBootEntry = namer.getUniqueName("howl_vue_boot");
        entryPoints[vueBootEntry] = VUE_BOOT_SPECIFIER;
      }

      // Vue pages: each `.vue` page route gets a client hydration chunk that
      // re-renders the page tree over the server-rendered markup.
      const vuePageEntryToPath = new Map<string, string>();
      // `_error.vue` (CommandType.Error) is built like a page — it SSRs +
      // hydrates through the engine when an error is caught.
      const vuePageFiles = this.#fsRoutes.files.filter(
        (f) =>
          f.engine === "vue" &&
          (f.type === CommandType.Route || f.type === CommandType.Error),
      );
      const vueAotEntryToPattern = new Map<string, string>();
      if (vuePageFiles.length > 0) {
        const wrapperDir = path.join(outDir, ".vue-pages");
        await Deno.remove(wrapperDir, { recursive: true }).catch(() => {});
        await Deno.mkdir(wrapperDir, { recursive: true });
        for (const f of vuePageFiles) {
          const slug = f.routePattern.replace(/[^a-zA-Z0-9]+/g, "_") || "root";
          const name = namer.getUniqueName(`vuepage_${slug}`);
          const wrapperPath = path.join(wrapperDir, `${name}.ts`);
          // Only [..Layouts, Page] hydrate inside `#howl-app`; `_app.vue` is
          // rendered server-side and stays static, so it's not in the chain.
          const { app, layouts } = await discoverEngineChain(f.filePath, ".vue");
          const comps = [...layouts, f.filePath];
          const arr = comps.map((_, i) => `_c${i}`).join(", ");

          if (f.aot === true) {
            // AOT route: the chunk carries **client** render fns + scoped CSS as
            // JS, so it can render client-side on navigation (no SSR-HTML fetch).
            // `_styles` spans the whole chain (app + layouts + page) so the
            // persistent shell keeps its CSS when the inner tree re-renders.
            const compImports = comps
              .map((p, i) =>
                `import _c${i}, { __howlStyles as _cs${i} } from ${
                  JSON.stringify(`${p}?howl-aot`)
                };`
              )
              .join("\n");
            const appStyle = app !== null
              ? `import { __howlStyles as _sapp } from ${JSON.stringify(`${app}?howl-aot`)};\n`
              : "";
            const styleArr = (app !== null ? ["..._sapp"] : [])
              .concat(comps.map((_, i) => `..._cs${i}`)).join(", ");
            await Deno.writeTextFile(
              wrapperPath,
              `${appStyle}${compImports}\n` +
                `import { aotMountVuePage, hydrateVuePage } from "${VUE_BOOT_SPECIFIER}";\n` +
                `const _comps = [${arr}];\nconst _styles = [${styleArr}];\n` +
                `export function hydrate() { hydrateVuePage(_comps); }\n` +
                `export function aotMount(props) { aotMountVuePage(_comps, _styles, props); }\n`,
            );
            vueAotEntryToPattern.set(name, f.routePattern);
          } else {
            const imports = comps
              .map((p, i) => `import _c${i} from ${JSON.stringify(p)};`)
              .join("\n");
            // Side-effect import of `_app.vue` purely to bundle its scoped CSS
            // (it owns the document but isn't hydrated, so its styles would
            // otherwise be missing from the page's CSS chunk).
            const appCss = app !== null ? `import ${JSON.stringify(app)};\n` : "";
            // Export `hydrate()` (rather than auto-running) so the same chunk URL
            // can be preloaded + imported on every visit without a cache-bust.
            await Deno.writeTextFile(
              wrapperPath,
              `${appCss}${imports}\n` +
                `import { hydrateVuePage } from "${VUE_BOOT_SPECIFIER}";\n` +
                `export function hydrate() { hydrateVuePage([${arr}]); }\n`,
            );
          }
          entryPoints[name] = wrapperPath;
          vuePageEntryToPath.set(name, f.filePath);
        }
      }

      // React page hydration wrappers — simpler than Vue (no SFC compile, no
      // scoped CSS): import [..Layouts, Page] (the `_app.tsx` shell stays static)
      // and export `hydrate()`. esbuild compiles the `.tsx` via `reactPlugin`.
      const reactPageEntryToPath = new Map<string, string>();
      const reactAotEntryToPattern = new Map<string, string>();
      const reactPageFiles = this.#fsRoutes.files.filter(
        (f) =>
          f.engine === "react" &&
          (f.type === CommandType.Route || f.type === CommandType.Error),
      );
      if (reactPageFiles.length > 0) {
        const wrapperDir = path.join(outDir, ".react-pages");
        await Deno.remove(wrapperDir, { recursive: true }).catch(() => {});
        await Deno.mkdir(wrapperDir, { recursive: true });
        for (const f of reactPageFiles) {
          const slug = f.routePattern.replace(/[^a-zA-Z0-9]+/g, "_") || "root";
          const name = namer.getUniqueName(`reactpage_${slug}`);
          const wrapperPath = path.join(wrapperDir, `${name}.tsx`);
          const { layouts } = await discoverEngineChain(f.filePath, ".tsx");
          const comps = [...layouts, f.filePath];
          const imports = comps
            .map((p, i) => `import _c${i} from ${JSON.stringify(p)};`)
            .join("\n");
          const arr = comps.map((_, i) => `_c${i}`).join(", ");
          // AOT routes (`__`/`___` prefix) additionally export `aotMount` so the
          // client can render them on nav with no server round-trip. Unlike Vue,
          // React has no scoped CSS to carry — the same component chain is reused.
          const aotImport = f.aot === true ? ", aotMountReactPage" : "";
          const aotExport = f.aot === true
            ? `export function aotMount(props: Record<string, unknown>) { aotMountReactPage(_comps, props); }\n`
            : "";
          await Deno.writeTextFile(
            wrapperPath,
            `${imports}\n` +
              `import { hydrateReactPage, renderReactPage${aotImport} } from "${REACT_BOOT_SPECIFIER}";\n` +
              `const _comps = [${arr}];\n` +
              `export function hydrate() { hydrateReactPage(_comps); }\n` +
              `export function render(props: Record<string, unknown>) { renderReactPage(_comps, props); }\n` +
              aotExport,
          );
          entryPoints[name] = wrapperPath;
          reactPageEntryToPath.set(name, f.filePath);
          if (f.aot === true) reactAotEntryToPattern.set(name, f.routePattern);
        }
      }

      const output = await bundleJs({
        cwd: root,
        outDir: staticOutDir,
        dev: dev ?? false,
        target,
        buildId: BUILD_ID,
        entryPoints,
        jsxImportSource,
        denoJsonPath: denoJson,
        sourceMap: this.config.sourceMap,
        alias: this.config.alias,
        plugins: [
          aotPlugin(aotEntries, root),
          ...(this.config.plugins ?? []),
        ],
      });

      const prefix = `/_howl/js/${BUILD_ID}/`;

      for (const name of buildCache.islandModNameToChunk.keys()) {
        const chunkName = output.entryToChunk.get(name);
        if (chunkName === undefined) {
          throw new Error(`Could not find chunk for island: ${name}`);
        }
        buildCache.islandModNameToChunk.get(name)!.browser = `${prefix}${chunkName}`;
      }

      for (const entry of aotEntries.values()) {
        const chunkName = output.entryToChunk.get(entry.name);
        if (chunkName === undefined) {
          throw new Error(`Could not find chunk for AOT route: ${entry.routePattern}`);
        }
        buildCache.aotRoutes.set(entry.routePattern, `${prefix}${chunkName}`);
      }

      for (const [entryName, islandName] of vueEntryToName) {
        const chunkName = output.entryToChunk.get(entryName);
        if (chunkName === undefined) {
          throw new Error(`Could not find chunk for Vue island: ${islandName}`);
        }
        buildCache.vueIslands.set(islandName, `${prefix}${chunkName}`);
      }
      if (vueBootEntry !== "") {
        const bootChunk = output.entryToChunk.get(vueBootEntry);
        if (bootChunk === undefined) {
          throw new Error(`Could not find chunk for Vue island boot runtime`);
        }
        buildCache.vueBoot = `${prefix}${bootChunk}`;
      }

      for (const [name, filePath] of vuePageEntryToPath) {
        const chunkName = output.entryToChunk.get(name);
        if (chunkName === undefined) {
          throw new Error(`Could not find chunk for Vue page: ${filePath}`);
        }
        buildCache.enginePages.set(filePath, `${prefix}${chunkName}`);
      }

      // React page chunks share the (engine-agnostic) `enginePages` map — keyed by
      // filePath, read by `segments.ts` to pass `chunkUrl` to the engine.
      for (const [name, filePath] of reactPageEntryToPath) {
        const chunkName = output.entryToChunk.get(name);
        if (chunkName === undefined) {
          throw new Error(`Could not find chunk for React page: ${filePath}`);
        }
        buildCache.enginePages.set(filePath, `${prefix}${chunkName}`);
      }

      // AOT manifest: route pattern → client chunk URL. Emitted to the page as
      // `window.__HOWL_VUE_AOT__` so the client renders these routes on nav.
      for (const [name, routePattern] of vueAotEntryToPattern) {
        const chunkName = output.entryToChunk.get(name);
        if (chunkName !== undefined) {
          buildCache.engineAot.set(routePattern, `${prefix}${chunkName}`);
        }
      }

      // React AOT routes share the (engine-agnostic) `engineAot` manifest; the React
      // engine emits it as `window.__HOWL_REACT_AOT__` for the client runtime.
      for (const [name, routePattern] of reactAotEntryToPattern) {
        const chunkName = output.entryToChunk.get(name);
        if (chunkName !== undefined) {
          buildCache.engineAot.set(routePattern, `${prefix}${chunkName}`);
        }
      }

      // Prod only: precompile each `.vue` page (its `_app.vue` + `_layout.vue`
      // chain + the page) into an importable SSR module via esbuild, so the
      // production snapshot can static-import it. A `deno compile` binary then
      // needs no `.vue` source on disk — the render engine renders the already
      // compiled component instead of compiling per request. Dev keeps the
      // request-time compile (fast reload, no precompile step).
      if (!(dev ?? false) && vuePageFiles.length > 0) {
        const ssrDir = path.join(outDir, ".vue-ssr");
        await Deno.remove(ssrDir, { recursive: true }).catch(() => {});
        await Deno.mkdir(ssrDir, { recursive: true });
        const ssrEntries: Record<string, string> = {};
        const ssrEntryToPath = new Map<string, string>();
        for (const [name, filePath] of vuePageEntryToPath) {
          const { app, layouts } = await discoverEngineChain(filePath, ".vue");
          const chain = app !== null ? [app, ...layouts, filePath] : [...layouts, filePath];
          const imports = chain
            .map((p, i) =>
              `import _c${i}, { __howlStyles as _s${i} } from ${JSON.stringify(`${p}?howl-ssr`)};`
            )
            .join("\n");
          const layoutStart = app !== null ? 1 : 0;
          const layoutExprs = layouts.map((_, i) => `_c${layoutStart + i}`).join(", ");
          const styleExprs = chain.map((_, i) => `..._s${i}`).join(", ");
          const usesPinia = app !== null && (await appSourceUsesPinia(app));
          const wrapperPath = path.join(ssrDir, `${name}.server.ts`);
          await Deno.writeTextFile(
            wrapperPath,
            `${imports}\n` +
              `export const app = ${app !== null ? "_c0" : "null"};\n` +
              `export const layouts = [${layoutExprs}];\n` +
              `export const page = _c${chain.length - 1};\n` +
              `export const styles = [${styleExprs}];\n` +
              `export const pinia = ${usesPinia};\n`,
          );
          ssrEntries[name] = wrapperPath;
          ssrEntryToPath.set(name, filePath);
        }
        const ssrOut = await bundleVueSsr({
          cwd: root,
          outDir: ssrDir,
          dev: false,
          buildId: BUILD_ID,
          entryPoints: ssrEntries,
          plugins: this.config.plugins ?? [],
        });
        for (const [name, filePath] of ssrEntryToPath) {
          const file = ssrOut.get(name);
          if (file === undefined) {
            throw new Error(`Could not find SSR module for Vue page: ${filePath}`);
          }
          buildCache.engineSsrPages.set(filePath, `.vue-ssr/${file}`);
        }
      }

      // Prod only: emit a `.react-ssr` wrapper per `.tsx` page that **statically
      // imports** its `_app.tsx` + `_layout.tsx` chain + the page and re-exports
      // them as `{ app, layouts, page }`. The snapshot static-imports these so a
      // `deno compile` binary embeds the whole `.tsx` graph — no source on disk
      // at runtime. Unlike Vue there's no compile step: Deno imports `.tsx`
      // natively (same as the built-in Preact engine). Imports are written
      // **relative** to the wrapper so the binary resolves them to the embedded
      // (`deno-compile://`) copies — an absolute `file://` specifier would match
      // the on-disk source instead, which the binary can't transpile.
      if (!(dev ?? false) && reactPageFiles.length > 0) {
        const ssrDir = path.join(outDir, ".react-ssr");
        await Deno.remove(ssrDir, { recursive: true }).catch(() => {});
        await Deno.mkdir(ssrDir, { recursive: true });
        for (const [name, filePath] of reactPageEntryToPath) {
          const { app, layouts } = await discoverEngineChain(filePath, ".tsx");
          const chain = app !== null ? [app, ...layouts, filePath] : [...layouts, filePath];
          const rel = (p: string) => {
            const r = path.relative(ssrDir, p);
            return r.startsWith(".") ? r : `./${r}`;
          };
          const imports = chain
            .map((p, i) => `import _c${i} from ${JSON.stringify(rel(p))};`)
            .join("\n");
          const layoutStart = app !== null ? 1 : 0;
          const layoutExprs = layouts.map((_, i) => `_c${layoutStart + i}`).join(", ");
          const wrapperPath = path.join(ssrDir, `${name}.server.tsx`);
          await Deno.writeTextFile(
            wrapperPath,
            `${imports}\n` +
              `export const app = ${app !== null ? "_c0" : "null"};\n` +
              `export const layouts = [${layoutExprs}];\n` +
              `export const page = _c${chain.length - 1};\n`,
          );
          buildCache.engineSsrPages.set(filePath, `.react-ssr/${name}.server.tsx`);
        }
      }

      for (let i = 0; i < output.files.length; i++) {
        const file = output.files[i];
        await buildCache.addProcessedFile(
          `${prefix}${file.path}`,
          file.contents,
          file.hash,
        );
      }
    } else {
      // No client artifacts → esbuild's `bundleJs()` is skipped, so plugins
      // registered for the bundle never receive an `onStart`. Fire their start
      // hooks directly so build-start side effects (e.g. `httpClientGenPlugin`)
      // still run for backend-only projects with no islands or FS routes.
      await runPluginStartHooks(this.config.plugins ?? []);
    }

    await buildCache.flush();

    if (!dev) {
      console.log(`Assets written to: ${colors.cyan(outDir)}`);
    }

    this.#ready.resolve();
  }
}

/**
 * Fire the `onStart` hooks of configured esbuild plugins without running a full
 * esbuild pass. Used when a project has no client artifacts (no islands, no FS
 * routes) so `bundleJs()` is skipped — plugins whose only job is a build-start
 * side effect (e.g. {@linkcode httpClientGenPlugin}) still need to run. Each
 * plugin's `setup` is invoked with a stub `PluginBuild` that records `onStart`
 * callbacks; all other registration hooks are no-ops since nothing is bundled.
 * Failures are logged, never thrown, matching esbuild's plugin-error handling.
 */
async function runPluginStartHooks(plugins: EsbuildPlugin[]): Promise<void> {
  for (const plugin of plugins) {
    const startCbs: Array<() => unknown> = [];
    const stub = {
      initialOptions: {},
      onStart: (cb: () => unknown) => startCbs.push(cb),
      onEnd: () => {},
      onResolve: () => {},
      onLoad: () => {},
      onDispose: () => {},
      // deno-lint-ignore no-explicit-any
    } as any;
    try {
      await plugin.setup(stub);
      for (const cb of startCbs) await cb();
    } catch (err) {
      console.error(`[howl] plugin "${plugin.name}" onStart hook failed:`, err);
    }
  }
}

/**
 * Specifier of the Vue island boot runtime, bundled when a project contains
 * `.island.vue` files. Provided by the optional `@hushkey/howl-vue` package;
 * Howl core stays Vue-agnostic apart from this string and the manifest globals.
 */
const VUE_BOOT_SPECIFIER = "@hushkey/howl-vue/boot";
const REACT_BOOT_SPECIFIER = "@hushkey/howl-react/boot";

/** Derive a Vue island's public name from its `*.island.vue` file path. */
function vueIslandName(spec: string): string {
  return path.basename(spec).replace(/\.island\.vue$/, "");
}

/**
 * Discover a `.vue` page's wrappers by walking up from the page directory:
 * collect `_layout.vue` at each level (outer → inner), stop at the first
 * `_app.vue`. Returns `{ app, layouts }` — `_app.vue` owns the document and is
 * imported only for its CSS (not hydrated). Mirrors the engine's runtime
 * discovery.
 */
/**
 * Build-time mirror of the engine's `<body pinia>` detection: returns whether
 * an `_app.vue` opts into Pinia, so the precompiled SSR module can bake the
 * flag (the engine can't read the `.vue` source in a compiled binary).
 */
async function appSourceUsesPinia(appPath: string): Promise<boolean> {
  try {
    const src = await Deno.readTextFile(appPath);
    return /<body[^>]*\bpinia\b/i.test(src);
  } catch {
    return false;
  }
}

async function discoverEngineChain(
  pageFilePath: string,
  ext: string,
): Promise<{ app: string | null; layouts: string[] }> {
  const layouts: string[] = [];
  let app: string | null = null;
  let dir = path.dirname(pageFilePath);
  for (let depth = 0; depth < 16; depth++) {
    const layout = path.join(dir, `_layout${ext}`);
    try {
      await Deno.stat(layout);
      layouts.unshift(layout);
    } catch {
      // no layout at this level
    }
    const appPath = path.join(dir, `_app${ext}`);
    try {
      await Deno.stat(appPath);
      app = appPath;
      break;
    } catch {
      // no app at this level
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { app, layouts };
}

export function specToName(spec: string): string {
  if (/^(https?:|file:)/.test(spec)) {
    const url = new URL(spec);
    if (url.pathname === "/") {
      return pathToExportName(url.hostname);
    }
    return pathToExportName(spec.slice(spec.lastIndexOf("/") + 1));
  }

  if (spec.startsWith("jsr:")) {
    const match = spec.match(
      /jsr:@([^/]+)\/([^@/]+)(@[\^~]?\d+\.\d+\.\d+([^/]+)?)?(\/.*)?$/,
    )!;
    return match[5] !== undefined
      ? pathToExportName(match[5])
      : pathToExportName(`${match[1]}_${match[2]}`);
  }

  if (spec.startsWith("npm:")) {
    const match = spec.match(
      /npm:(@([^/]+)\/([^@/]+)|[^@/]+)(@[\^~]?\d+\.\d+\.\d+([^/]+)?)?(\/.*)?$/,
    )!;
    if (match[6] !== undefined) return pathToExportName(match[6]);
    if (match[2] !== undefined) return pathToExportName(`${match[2]}_${match[3]}`);
    return pathToExportName(match[1]);
  }

  const match = spec.match(/^(@([^/]+)\/([^@/]+)|[^@/]+)(\/.*)?$/);
  if (match !== null) {
    if (match[4] !== undefined) return pathToExportName(match[4]);
    if (match[2] !== undefined) return pathToExportName(`${match[2]}_${match[3]}`);
    return pathToExportName(match[1]);
  }

  return pathToExportName(spec);
}
