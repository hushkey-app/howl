import postcss from "postcss";
import type { AcceptedPlugin } from "postcss";
import type { Builder } from "../dev/builder.ts";
import type { OnTransformOptions } from "../dev/file_transformer.ts";

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

  // `@tailwindcss/postcss` mis-points its `exports.types` at a CJS `.d.ts`
  // (`export =`, no default export), which trips strict type-checking on a static
  // default import (TS1192). Import it dynamically — typed via a cast — so the bad
  // type entry is never consulted. Its ESM runtime has a real default export and
  // resolves in every environment, including when `@hushkey/howl` is loaded from a
  // remote `https://` URL on JSR (where `createRequire` throws). Memoised so the
  // module and PostCSS processor are built once, lazily.
  let processor: Promise<ReturnType<typeof postcss>> | null = null;
  const getProcessor = (): Promise<ReturnType<typeof postcss>> => {
    processor ??= import("@tailwindcss/postcss").then((mod) => {
      const tailwind = (mod as unknown as {
        default: (options?: PluginOptions) => AcceptedPlugin;
      }).default;
      return postcss(
        tailwind({ optimize: builder.config.mode === "production", ...tailwindOptions }),
      );
    });
    return processor;
  };

  builder.onTransformStaticFile(
    { pluginName: "howl-tailwind", filter: /\.css$/, exclude },
    async (args) => {
      const instance = await getProcessor();
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
