/**
 * `@hushkey/howl-vue` — Vue Single-File Component support for Howl, built on
 * the existing esbuild toolchain (no Vite).
 *
 * Status: experimental. The `.vue` compiler ({@linkcode compileSfc}), esbuild
 * plugin ({@linkcode vuePlugin}), and the client-side island runtime
 * ({@linkcode VueIsland} host + {@linkcode bootVueIslands}) are in place. The
 * Howl build wiring that emits the island→chunk manifest lands next.
 */
export { compileSfc } from "./sfc.ts";
export type { CompiledSfc, CompileSfcOptions } from "./sfc.ts";
export { vuePlugin } from "./plugin.ts";
export type { VuePluginOptions } from "./plugin.ts";
export { mountVueIsland } from "./runtime/mount.ts";
export { VUE_ISLAND_ATTR, VUE_ISLAND_PROPS_ATTR, VueIsland } from "./runtime/host.ts";
export type { VueIslandProps } from "./runtime/host.ts";
export { aotMountVuePage, bootVueIslands, hydrateVuePage } from "./runtime/boot.ts";
// Head/SEO composables (`useHead`, `useSeoMeta`) are exposed via the lightweight
// `@hushkey/howl-vue/head` entry — NOT here — so importing them into a `.vue`
// page doesn't pull this module's build-time deps (compiler-sfc, esbuild).
export type { ChunkImporter, IslandMounter } from "./runtime/boot.ts";
export { vueEngine } from "./engine.ts";
export type { VueEngineOptions, VuePageProps, VueSsrModule } from "./engine.ts";
