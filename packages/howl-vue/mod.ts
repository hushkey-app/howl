/**
 * `@hushkey/howl-vue` — Vue Single-File Component support for Howl, built on
 * the existing esbuild toolchain (no Vite).
 *
 * The `.vue` compiler ({@linkcode compileSfc}), esbuild plugin
 * ({@linkcode vuePlugin}), and the full-page render engine
 * ({@linkcode vueEngine}) live here.
 */
export { compileSfc } from "./sfc.ts";
export type { CompiledSfc, CompileSfcOptions } from "./sfc.ts";
export { vuePlugin } from "./plugin.ts";
export type { VuePluginOptions } from "./plugin.ts";
export { aotMountVuePage, hydrateVuePage } from "./runtime/boot.ts";
// Head/SEO composables (`useHead`, `useSeoMeta`) are exposed via the lightweight
// `@hushkey/howl-vue/head` entry — NOT here — so importing them into a `.vue`
// page doesn't pull this module's build-time deps (compiler-sfc, esbuild).
export { vueEngine } from "./engine.ts";
export type { VueEngineOptions, VuePageProps, VueSsrModule } from "./engine.ts";
