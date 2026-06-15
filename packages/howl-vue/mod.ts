/**
 * `@hushkey/howl-vue` — Vue Single-File Component support for Howl, built on
 * the existing esbuild toolchain (no Vite).
 *
 * The esbuild plugin ({@linkcode vuePlugin}) and the full-page render engine
 * ({@linkcode vueEngine}) live here; the `.vue` compiler (`compileSfc`) is at
 * `@hushkey/howl-vue/sfc`.
 */
// The `.vue` compiler (`compileSfc`) is exposed via `@hushkey/howl-vue/sfc` —
// NOT re-exported here — so a production server importing `vueEngine` never
// evaluates `@vue/compiler-sfc` at startup (it loads lazily on dev compiles).
export { vuePlugin } from "./plugin.ts";
export type { VuePluginOptions } from "./plugin.ts";
export { aotMountVuePage, hydrateVuePage } from "./runtime/boot.ts";
// Head/SEO composables (`useHead`, `useSeoMeta`) are exposed via the lightweight
// `@hushkey/howl-vue/head` entry — NOT here — so importing them into a `.vue`
// page doesn't pull this module's build-time deps (compiler-sfc, esbuild).
export { vueEngine } from "./engine.ts";
export type { VueEngineOptions, VuePageProps, VueSsrModule } from "./engine.ts";
