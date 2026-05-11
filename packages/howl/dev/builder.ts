import {
  Howl,
  fsAdapter,
  type ListenOptions,
  parseDirPath,
  pathToExportName,
  setBuildCache,
  TEST_FILE_PATTERN,
  UniqueNamer,
} from "../core/mod.ts";
import * as path from "@std/path";
import * as colors from "@std/fmt/colors";
import { bundleJs, type HowlBundleOptions } from "./esbuild.ts";
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
import { devErrorOverlay } from "./middlewares/error_overlay/middleware.tsx";
import { automaticWorkspaceFolders } from "./middlewares/automatic_workspace_folders.ts";
import { checkDenoCompilerOptions } from "./check.ts";
import { crawlFsItem } from "./fs_crawl.ts";
import { type AotEntry, aotPlugin } from "./plugins/aot.ts";
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
   * URL patterns of routes flagged for SSG (`___page.tsx` prefix). Returned
   * after {@linkcode build} has crawled the FS; an empty array otherwise.
   */
  getSsgPatterns(): string[] {
    return this.#fsRoutes.files
      .filter((f) => f.type === CommandType.Route && f.ssg)
      .map((f) => f.routePattern);
  }

  #collectAotEntries(namer: UniqueNamer): Map<string, AotEntry> {
    const entries = new Map<string, AotEntry>();

    const aotFiles = this.#fsRoutes.files.filter((f) =>
      f.type === CommandType.Route && f.aot
    );
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

      const slug = page.routePattern.replace(/[^a-zA-Z0-9]+/g, "_") || "root";
      const name = namer.getUniqueName(`aot_${slug}`);

      entries.set(name, {
        name,
        routePattern: page.routePattern,
        pagePath: page.filePath,
        layouts,
        appPath: appFile?.filePath ?? null,
      });
    }

    return entries;
  }

  async #crawlFsItems() {
    const { islands, routes } = await crawlFsItem({
      islandDir: this.config.islandDir,
      routeDir: this.config.routeDir,
      ignore: this.config.ignore,
    });

    for (let i = 0; i < islands.length; i++) {
      this.registerIsland(islands[i]);
    }

    this.#fsRoutes.files = routes;
  }

  async #build<T>(buildCache: DevBuildCache<T>, dev: boolean): Promise<void> {
    const { target, outDir, root } = this.config;
    const staticOutDir = path.join(outDir, "static");

    const hasClientArtifacts = this.#islandSpecifiers.size > 0 ||
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

      const runtimeUrl = new URL(
        dev ? "../core/runtime/client/dev.ts" : "../core/runtime/client/mod.ts",
        import.meta.url,
      ).href;

      const entryPoints: Record<string, string> = {
        "howl-runtime": runtimeUrl,
      };

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

      const aotEntries = this.#collectAotEntries(namer);
      for (const entry of aotEntries.values()) {
        entryPoints[entry.name] = `aot:${entry.name}`;
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

      for (let i = 0; i < output.files.length; i++) {
        const file = output.files[i];
        await buildCache.addProcessedFile(
          `${prefix}${file.path}`,
          file.contents,
          file.hash,
        );
      }
    }

    await buildCache.flush();

    if (!dev) {
      console.log(`Assets written to: ${colors.cyan(outDir)}`);
    }

    this.#ready.resolve();
  }
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
