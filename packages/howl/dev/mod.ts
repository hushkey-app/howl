/**
 * @module
 *
 * Build-pipeline entrypoint for `@hushkey/howl/dev`. Exports
 * {@linkcode HowlBuilder} (the recommended high-level builder),
 * {@linkcode Builder} (lower-level esbuild driver), the file-transformer
 * hooks, build-cache types, and the CSS-modules plugin. Use this from
 * `dev.ts` to start the dev server (`builder.listen()`) or run a
 * production build (`builder.build()`).
 */

export {
  Builder,
  type BuildOptions,
  type DevReloadHooks,
  type ResolvedBuildConfig,
} from "./builder.ts";
export { HowlBuilder, type HowlDevOptions } from "./howl_builder.ts";
export { type ApiEntry } from "./dev_build_cache.ts";
export { DevReloadHub } from "./middlewares/live_reload.ts";
export { classifyDevChange, type DevChangeKind, type DevWatchDirs, DevWatcher } from "./watcher.ts";
export {
  type OnTransformArgs,
  type OnTransformOptions,
  type OnTransformResult,
  type TransformFn,
  type TransformMode,
} from "./file_transformer.ts";
export { type CssModulesOptions, cssModulesPlugin } from "./plugins/css_modules.ts";
