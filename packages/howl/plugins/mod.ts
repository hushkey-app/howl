/**
 * @module
 *
 * Official plugin entrypoint for `@hushkey/howl/plugins`. Exports
 * {@linkcode tailwindPlugin} for wiring Tailwind v4 into the build
 * pipeline, plus a `tailwindConfigBase` literal that user
 * `tailwind.config.ts` files can extend, and {@linkcode httpClientGenPlugin}
 * for generating a typed http client from `*.api.ts` files at build time.
 */

export { tailwindPlugin, type TailwindPluginOptions } from "./tailwind.plugin.ts";
export { baseConfig as tailwindConfigBase } from "./tailwind.config.base.ts";
export {
  buildHttpClient,
  type BuildHttpClientConfig,
  httpClientGenPlugin,
} from "./http-client-gen.plugin.ts";
