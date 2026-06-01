import type { Plugin } from "esbuild";
import * as path from "@std/path";
import { compileSfc } from "./sfc.ts";

/** Marker query appended to a `.vue` path to import its extracted styles. */
const STYLE_QUERY = "?howl-vue-style=";

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
 * virtual CSS module so it flows into esbuild's normal CSS output (and, in
 * turn, Howl's island-CSS asset pipeline).
 *
 * Bare `vue` / `vue/server-renderer` imports in the generated code are left
 * for esbuild (and Howl's Deno resolver) to resolve.
 */
export function vuePlugin(options: VuePluginOptions = {}): Plugin {
  const ssr = options.ssr ?? false;
  return {
    name: "howl-vue",
    setup(build) {
      // Styles compiled per-file, keyed by absolute path, read back by the
      // virtual-module loader below.
      const styleStore = new Map<string, string[]>();

      build.onLoad({ filter: /\.vue$/ }, async (args) => {
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
}
