/**
 * Per-page head/SEO composables, re-exported from `unhead` via a **lightweight**
 * entry (`@hushkey/howl-vue/head`) so importing them into a `.vue` page doesn't
 * pull in the build-time `@vue/compiler-sfc` / esbuild that the main `mod.ts`
 * re-exports. Use inside `<script setup>`:
 *
 * ```ts
 * import { useHead } from "@hushkey/howl-vue/head";
 * useHead({ title: "About", meta: [{ name: "description", content: "…" }] });
 * ```
 */
export { useHead, useSeoMeta } from "@unhead/vue";
