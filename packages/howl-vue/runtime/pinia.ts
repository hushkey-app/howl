/**
 * Pinia store helpers, re-exported via a **lightweight** entry
 * (`@hushkey/howl-vue/pinia`) so importing them into a `.vue` page or a store
 * file doesn't pull the main `mod.ts` build-time deps. Enable Pinia by adding
 * the `pinia` attribute to `<body>` in `_app.vue` — Howl installs it on the
 * hydrated app (`app.use(pinia)`), SSR-serializes the state, and hydrates it on
 * the client (persisting across client-nav).
 *
 * ```ts
 * import { defineStore } from "@hushkey/howl-vue/pinia";
 * export const useStore = defineStore("main", { state: () => ({ count: 0 }) });
 * ```
 */
export { acceptHMRUpdate, defineStore, getActivePinia, setActivePinia, storeToRefs } from "pinia";
