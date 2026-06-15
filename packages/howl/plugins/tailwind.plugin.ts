import { createRequire } from "node:module";
import postcss from "postcss";
import type { AcceptedPlugin } from "postcss";
import type { Builder } from "../dev/builder.ts";
import type { OnTransformOptions } from "../dev/file_transformer.ts";

// `@tailwindcss/postcss` ships an ESM runtime with a real default export, but its
// package `exports` map points `types` at a CJS `.d.ts` that uses `export =` (no
// default export). Newer Deno's strict npm type resolution rejects a default
// import of it (TS1192). Load the identical runtime value via `createRequire` and
// type it locally, sidestepping the package's mis-pointed type entry.
const require = createRequire(import.meta.url);
const twPostcss = require("@tailwindcss/postcss") as (
  options?: { base?: string; optimize?: boolean | { minify?: boolean } },
) => AcceptedPlugin;

type PluginOptions = {
  /**
   * Base CSS to be included. Set to null to exclude base styles.
   */
  base?: string;
  /**
   * Enable or disable CSS optimization.
   * Defaults to true in production mode, false in development.
   * @default builder.config.mode === "production"
   */
  optimize?: boolean | {
    minify?: boolean;
  };
};

/**
 * Options accepted by the {@linkcode tailwindPlugin}.
 */
export interface TailwindPluginOptions extends PluginOptions {
  /**
   * Exclude paths or globs from Tailwind processing.
   * @example exclude: ["vendor", /\.legacy\.css$/]
   */
  exclude?: OnTransformOptions["exclude"];
}

/**
 * Tailwind CSS v4 plugin for howl.
 * Processes CSS files through PostCSS + Tailwind at build time.
 * Optimization is automatically enabled in production mode.
 *
 * @example
 * // In dev.ts:
 * import { tailwindPlugin } from "@howl/plugins/tailwind";
 *
 * const builder = new howlBuilder(howl, {
 *   root: import.meta.dirname,
 *   importApp: async () => (await import("./main.ts")).app,
 * });
 *
 * tailwindPlugin(builder.getBuilder("default")!, { exclude: ["/vendor/**"] });
 */
export function tailwindPlugin(
  builder: Builder,
  options: TailwindPluginOptions = {},
): void {
  const { exclude, ...tailwindOptions } = options;

  const instance = postcss(
    twPostcss({
      optimize: builder.config.mode === "production",
      ...tailwindOptions,
    }),
  );

  builder.onTransformStaticFile(
    { pluginName: "howl-tailwind", filter: /\.css$/, exclude },
    async (args) => {
      const res = await instance.process(args.text, {
        from: args.path,
      });
      return {
        content: res.content,
        map: res.map?.toString(),
      };
    },
  );
}
