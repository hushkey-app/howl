import type { Plugin } from "esbuild";
import * as path from "@std/path";
import { compileSfc, prepareTypeResolution } from "./sfc.ts";

/** Marker query appended to a `.vue` path to import its extracted styles. */
const STYLE_QUERY = "?howl-vue-style=";

/**
 * Marker query a server-side build appends to a `.vue` import to force an SSR
 * compile regardless of the plugin's default mode. The matching module exports
 * the component (default) plus its scoped CSS as a `__howlStyles` string array
 * (so the SSR page bundle can inline styles without a separate CSS file).
 */
const SSR_QUERY = "?howl-ssr";

/**
 * Like {@linkcode SSR_QUERY} but emits a **client** (browser) render function —
 * used by AOT page chunks, which render a route on the client during navigation.
 * Exposes scoped CSS as a `__howlStyles` JS array so the chunk is self-contained
 * (no CSS refetch when navigating to the route).
 */
const AOT_QUERY = "?howl-aot";

/**
 * Options for {@linkcode vuePlugin}.
 */
export interface VuePluginOptions {
  /**
   * Compile server (SSR) render functions instead of browser render
   * functions. Howl builds the client bundle with `ssr: false` (the default)
   * and loads `.vue` modules server-side with `ssr: true`.
   */
  ssr?: boolean;
}

/**
 * esbuild plugin that compiles Vue Single-File Components (`.vue`) using
 * `@vue/compiler-sfc` — no Vite required. Each `<style>` block is emitted as a
 * virtual CSS module so it flows into esbuild's normal CSS output.
 *
 * Bare `vue` / `vue/server-renderer` imports in the generated code are left
 * for esbuild (and Howl's Deno resolver) to resolve.
 */
/** Shared symbol key under which a plugin declares its Howl render engine. */
const HOWL_ENGINE = Symbol.for("howl.engine");

export function vuePlugin(options: VuePluginOptions = {}): Plugin {
  const ssr = options.ssr ?? false;
  const plugin: Plugin = {
    name: "howl-vue",
    setup(build) {
      // Vue's esm-bundler build expects these compile-time flags to be defined
      // by the bundler (better tree-shaking + no console warning).
      build.initialOptions.define = {
        __VUE_OPTIONS_API__: "true",
        __VUE_PROD_DEVTOOLS__: "false",
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
        ...build.initialOptions.define,
      };

      // Styles compiled per-file, keyed by absolute path, read back by the
      // virtual-module loader below.
      const styleStore = new Map<string, string[]>();

      // Server (SSR) page build: `import x from "./Foo.vue?howl-ssr"` forces an
      // SSR compile and exposes styles as a JS `__howlStyles` export. Used by
      // Howl's prod build to precompile `.vue` pages into importable JS modules
      // (so a `deno compile` binary needs no `.vue` source at runtime).
      build.onResolve({ filter: /\.vue\?howl-ssr$/ }, (args) => {
        const real = args.path.slice(0, -SSR_QUERY.length);
        const abs = path.isAbsolute(real) ? real : path.join(args.resolveDir, real);
        return { path: abs, namespace: "howl-vue-ssr" };
      });

      build.onLoad(
        { filter: /.*/, namespace: "howl-vue-ssr" },
        async (args) => {
          await prepareTypeResolution();
          const source = await Deno.readTextFile(args.path);
          const { code, styles } = compileSfc(source, args.path, { ssr: true });
          const contents = `${code}\nexport const __howlStyles = ${JSON.stringify(styles)};\n`;
          return { contents, loader: "ts", resolveDir: path.dirname(args.path) };
        },
      );

      // AOT client chunk: `import x from "./Foo.vue?howl-aot"` → a browser render
      // function plus `__howlStyles`, so an AOT route can be rendered client-side
      // on navigation with its scoped CSS, no SSR-HTML refetch.
      build.onResolve({ filter: /\.vue\?howl-aot$/ }, (args) => {
        const real = args.path.slice(0, -AOT_QUERY.length);
        const abs = path.isAbsolute(real) ? real : path.join(args.resolveDir, real);
        return { path: abs, namespace: "howl-vue-aot" };
      });

      build.onLoad(
        { filter: /.*/, namespace: "howl-vue-aot" },
        async (args) => {
          await prepareTypeResolution();
          const source = await Deno.readTextFile(args.path);
          const { code, styles } = compileSfc(source, args.path, { ssr: false });
          const contents = `${code}\nexport const __howlStyles = ${JSON.stringify(styles)};\n`;
          return { contents, loader: "ts", resolveDir: path.dirname(args.path) };
        },
      );

      build.onLoad({ filter: /\.vue$/ }, async (args) => {
        await prepareTypeResolution();
        const source = await Deno.readTextFile(args.path);
        const { code, styles } = compileSfc(source, args.path, { ssr });
        styleStore.set(args.path, styles);

        let contents = code;
        for (let i = 0; i < styles.length; i++) {
          contents = `import ${JSON.stringify(`${args.path}${STYLE_QUERY}${i}`)};\n${contents}`;
        }

        return {
          contents,
          loader: "ts",
          resolveDir: path.dirname(args.path),
        };
      });

      build.onResolve(
        { filter: /\?howl-vue-style=\d+$/ },
        (args) => ({ path: args.path, namespace: "howl-vue-style" }),
      );

      build.onLoad(
        { filter: /.*/, namespace: "howl-vue-style" },
        (args) => {
          const sep = args.path.lastIndexOf(STYLE_QUERY);
          const file = args.path.slice(0, sep);
          const idx = Number(args.path.slice(sep + STYLE_QUERY.length));
          const css = styleStore.get(file)?.[idx] ?? "";
          return { contents: css, loader: "css" };
        },
      );
    },
  };
  // Declare to HowlBuilder that this plugin renders `.vue` routes — so the
  // engine→extension mapping lives with the plugin, not hardcoded in core.
  // deno-lint-ignore no-explicit-any
  (plugin as any)[HOWL_ENGINE] = { extensions: [".vue"], engine: "vue" };
  return plugin;
}
