import { denoPlugin } from "@deno/esbuild-plugin";
import type { BuildOptions, Plugin as EsbuildPlugin } from "esbuild";
import * as path from "@std/path";

export interface HowlBundleOptions {
  dev: boolean;
  cwd: string;
  buildId: string;
  outDir: string;
  denoJsonPath: string;
  entryPoints: Record<string, string>;
  target: string | string[];
  jsxImportSource?: string;
  /** Alias map passed directly to esbuild. */
  alias?: Record<string, string>;
  /**
   * Additional esbuild plugins injected before the Deno resolver.
   * User plugins run after internal plugins (build-id)
   * but before denoPlugin so they can intercept imports first.
   */
  plugins?: EsbuildPlugin[];
  sourceMap?: {
    kind: BuildOptions["sourcemap"];
    sourceRoot?: BuildOptions["sourceRoot"];
    sourcesContent?: BuildOptions["sourcesContent"];
  };
}

export interface BuildOutput {
  entryToChunk: Map<string, string>;
  dependencies: Map<string, string[]>;
  files: Array<{ hash: string | null; contents: Uint8Array; path: string }>;
}

let esbuild: null | typeof import("esbuild") = null;

export async function bundleJs(
  options: HowlBundleOptions,
): Promise<BuildOutput> {
  if (esbuild === null) {
    await startEsbuild();
  }

  try {
    await Deno.mkdir(options.cwd, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) {
      throw err;
    }
  }

  const bundle = await esbuild!.build({
    entryPoints: options.entryPoints,

    platform: "browser",
    target: options.target,

    format: "esm",
    bundle: true,
    splitting: true,
    treeShaking: true,
    sourcemap: options.dev ? "linked" : options.sourceMap?.kind,
    sourceRoot: options.dev ? undefined : options.sourceMap?.sourceRoot,
    sourcesContent: options.dev ? undefined : options.sourceMap?.sourcesContent,
    minify: !options.dev,
    logOverride: {
      "suspicious-nullish-coalescing": "silent",
      "unsupported-jsx-comment": "silent",
    },

    jsxDev: options.dev,
    jsx: "automatic",
    jsxImportSource: options.jsxImportSource,

    absWorkingDir: options.cwd,
    outdir: ".",
    write: false,
    metafile: true,

    alias: options.alias,

    define: {
      "process.env.NODE_ENV": JSON.stringify(
        options.dev ? "development" : "production",
      ),
    },

    plugins: [
      buildIdPlugin(options.buildId),
      windowsPathFixer(),
      ...(options.plugins ?? []),
      denoPlugin({
        preserveJsx: true,
        debug: false,
        publicEnvVarPrefix: "howl_PUBLIC_",
      }),
    ],
  });

  const files: BuildOutput["files"] = [];
  for (let i = 0; i < bundle.outputFiles.length; i++) {
    const outputFile = bundle.outputFiles[i];
    const relative = path.relative(options.cwd, outputFile.path);
    files.push({
      path: relative,
      contents: outputFile.contents,
      hash: outputFile.hash,
    });
  }

  files.push({
    path: "metafile.json",
    contents: new TextEncoder().encode(JSON.stringify(bundle.metafile)),
    hash: null,
  });

  const entryToChunk = new Map<string, string>();
  const dependencies = new Map<string, string[]>();

  const entryToName = new Map(
    Array.from(Object.entries(options.entryPoints)).map(
      (entry) => [entry[1], entry[0]],
    ),
  );

  if (bundle.metafile) {
    const metaOutputs = new Map(Object.entries(bundle.metafile.outputs));

    for (const [entryPath, entry] of metaOutputs.entries()) {
      const imports = entry.imports
        .filter(({ kind }) => kind === "import-statement")
        .map(({ path }) => path);
      dependencies.set(entryPath, imports);

      if (entryPath !== "howl-runtime.js" && entry.entryPoint !== undefined) {
        const basename = path.basename(entryPath, path.extname(entryPath));
        const filePath = options.entryPoints[basename];
        const name = entryToName.get(filePath)!;
        entryToChunk.set(name, entryPath);
      }
    }
  }

  if (!options.dev) {
    esbuild = null;
  }

  return { files, entryToChunk, dependencies };
}

/**
 * Bundle Vue page **server** (SSR) entries into importable ESM modules — one per
 * page — that the production snapshot statically imports (so a `deno compile`
 * binary needs no `.vue` source on disk).
 *
 * Bare imports (`vue`, `vue/server-renderer`, `pinia`, `@unhead/vue`,
 * `@hushkey/howl-vue/*`) are left **external** (`packages: "external"`) so the
 * precompiled components share the exact runtime instances the render engine
 * uses — a bundled-in Vue would be a different instance and mismatch the
 * engine's `renderToString`. Relative imports (e.g. a colocated store) are
 * bundled in. Returns a map of entry name → output filename (in `outDir`).
 */
export async function bundleVueSsr(
  options: {
    cwd: string;
    outDir: string;
    dev: boolean;
    buildId: string;
    entryPoints: Record<string, string>;
    plugins?: EsbuildPlugin[];
  },
): Promise<Map<string, string>> {
  if (esbuild === null) {
    await startEsbuild();
  }
  await Deno.mkdir(options.outDir, { recursive: true });

  await esbuild!.build({
    entryPoints: options.entryPoints,
    platform: "neutral",
    format: "esm",
    bundle: true,
    splitting: false,
    treeShaking: true,
    // Bare deps stay external so the precompiled component shares the engine's
    // runtime instances. `@hushkey/howl-vue/*` must be external too (not bundled
    // via node_modules) so its `pinia` / `@unhead/vue` deps resolve through
    // howl-vue's own import map — and the user need not declare them.
    packages: "external",
    external: ["@hushkey/howl-vue/*"],
    minify: !options.dev,
    absWorkingDir: options.cwd,
    outdir: options.outDir,
    entryNames: "[name]",
    write: true,
    logOverride: {
      "suspicious-nullish-coalescing": "silent",
      "unsupported-jsx-comment": "silent",
    },
    plugins: [
      buildIdPlugin(options.buildId),
      ...(options.plugins ?? []),
    ],
  });

  const entryToFile = new Map<string, string>();
  for (const name of Object.keys(options.entryPoints)) {
    entryToFile.set(name, `${name}.js`);
  }
  return entryToFile;
}

let initialized = false;

export async function startEsbuild() {
  esbuild = Deno.env.get("howl_ESBUILD_LOADER") === "portable"
    ? await import("esbuild-wasm")
    : await import("esbuild");

  if (!initialized) {
    await esbuild!.initialize({});
    initialized = true;
  }
}

// --- internal plugins ---

function buildIdPlugin(buildId: string): EsbuildPlugin {
  return {
    name: "howl-build-id",
    setup(build) {
      build.onResolve({
        filter: /build-id\.ts$|\/build-id$/,
      }, (args) => ({
        path: args.path,
        namespace: "howl-internal-build-id",
      }));
      build.onLoad({
        filter: /.*/,
        namespace: "howl-internal-build-id",
      }, () => ({
        contents:
          `export const BUILD_ID = "${buildId}"; export const DENO_DEPLOYMENT_ID = undefined; export function setBuildId(id) { }`,
      }));
    },
  };
}

function windowsPathFixer(): EsbuildPlugin {
  return {
    name: "howl-fix-windows",
    setup(build) {
      if (Deno.build.os !== "windows") return;
      build.onResolve({ filter: /\.*/ }, (args) => {
        if (args.path.startsWith("\\")) {
          return { path: path.resolve(args.path) };
        }
      });
    },
  };
}
