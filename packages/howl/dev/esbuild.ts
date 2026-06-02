import { denoPlugin } from "@deno/esbuild-plugin";
import type { BuildOptions, Plugin as EsbuildPlugin } from "esbuild";
import * as path from "@std/path";

/**
 * Forces all React imports to resolve to preact/compat.
 * This works at the resolver level, catching imports inside node_modules
 * that the alias map misses.
 */
function reactCompatPlugin(cwd: string): EsbuildPlugin {
  return {
    name: "howl-react-compat",
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({
        path: "react",
        namespace: "howl-react-compat",
      }));
      build.onResolve({ filter: /^react-dom$/ }, () => ({
        path: "react-dom",
        namespace: "howl-react-compat",
      }));
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({
        path: "react/jsx-runtime",
        namespace: "howl-react-compat",
      }));
      build.onResolve({ filter: /^react\/jsx-dev-runtime$/ }, () => ({
        path: "react/jsx-dev-runtime",
        namespace: "howl-react-compat",
      }));

      build.onLoad(
        { filter: /^react$/, namespace: "howl-react-compat" },
        () => ({
          contents: `export * from "preact/compat"; export { default } from "preact/compat";`,
          loader: "js",
          resolveDir: cwd,
        }),
      );
      build.onLoad(
        { filter: /^react-dom$/, namespace: "howl-react-compat" },
        () => ({
          contents: `export * from "preact/compat"; export { default } from "preact/compat";`,
          loader: "js",
          resolveDir: cwd,
        }),
      );
      build.onLoad(
        { filter: /^react\/jsx-runtime$/, namespace: "howl-react-compat" },
        () => ({
          contents:
            `export * from "preact/jsx-runtime"; export { default } from "preact/jsx-runtime";`,
          loader: "js",
          resolveDir: cwd,
        }),
      );
      build.onLoad(
        { filter: /^react\/jsx-dev-runtime$/, namespace: "howl-react-compat" },
        () => ({
          contents:
            `export * from "preact/jsx-dev-runtime"; export { default } from "preact/jsx-dev-runtime";`,
          loader: "js",
          resolveDir: cwd,
        }),
      );
    },
  };
}
export interface HowlBundleOptions {
  dev: boolean;
  cwd: string;
  buildId: string;
  outDir: string;
  denoJsonPath: string;
  entryPoints: Record<string, string>;
  target: string | string[];
  jsxImportSource?: string;
  /**
   * Alias map passed directly to esbuild.
   * @example { "react": "npm:preact/compat", "react-dom": "npm:preact/compat" }
   */
  alias?: Record<string, string>;
  /**
   * Additional esbuild plugins injected before the Deno resolver.
   * User plugins run after internal plugins (build-id, preact-debugger)
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

const PREACT_ENV = Deno.env.get("PREACT_PATH");

export async function bundleJs(
  options: HowlBundleOptions,
): Promise<BuildOutput> {
  if (esbuild === null) {
    await startEsbuild();
  }

  // A real-React app (registers `reactPlugin`, which declares its engine under
  // the `howl.engine` symbol) must NOT get the React→Preact compat shim, so its
  // `react` / `react-dom` imports resolve to real React.
  // deno-lint-ignore no-explicit-any
  const realReact = (options.plugins ?? []).some((p: any) =>
    p?.[Symbol.for("howl.engine")]?.engine === "react"
  );
  let alias = options.alias;
  if (realReact && alias !== undefined) {
    alias = { ...alias };
    for (const k of ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"]) {
      delete alias[k];
    }
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
    jsxImportSource: options.jsxImportSource ?? "preact",

    absWorkingDir: options.cwd,
    outdir: ".",
    write: false,
    metafile: true,

    // React → Preact/compat shim and other aliases (stripped for real React)
    alias,

    define: {
      "process.env.NODE_ENV": JSON.stringify(
        options.dev ? "development" : "production",
      ),
    },

    plugins: [
      preactDebugger(PREACT_ENV),
      buildIdPlugin(options.buildId),
      windowsPathFixer(),
      ...(realReact ? [] : [reactCompatPlugin(options.cwd)]),
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

function toPreactModPath(mod: string): string {
  if (mod === "preact/debug") return path.join("debug", "dist", "debug.module.js");
  if (mod === "preact/hooks") return path.join("hooks", "dist", "hooks.module.js");
  if (mod === "preact/devtools") return path.join("devtools", "dist", "devtools.module.js");
  if (mod === "preact/compat") return path.join("compat", "dist", "compat.module.js");
  if (mod === "preact/jsx-runtime" || mod === "preact/jsx-dev-runtime") {
    return path.join("jsx-runtime", "dist", "jsxRuntime.module.js");
  }
  return path.join("dist", "preact.module.js");
}

function preactDebugger(preactPath: string | undefined): EsbuildPlugin {
  return {
    name: "howl-preact-debugger",
    setup(build) {
      if (preactPath === undefined) return;
      build.onResolve({ filter: /^preact/ }, (args) => ({
        path: path.resolve(preactPath, toPreactModPath(args.path)),
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
