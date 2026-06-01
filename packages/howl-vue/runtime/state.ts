import { defineStore } from "pinia";

/**
 * Global store mirroring the server `ctx.state` — the request-scoped context
 * Howl shares between backend and frontend. Howl seeds it on SSR and re-syncs
 * it on every client navigation, so it always reflects the current request's
 * `ctx.state`. Read it anywhere (no prop-drilling), reactively:
 *
 * ```ts
 * import { useState } from "@hushkey/howl-vue/state";
 * const state = useState<State>();      // state.user, state.client.title, …
 * ```
 *
 * Requires Pinia enabled via `<body pinia>` in `_app.vue`.
 */
const useStateStore = defineStore("state", {
  state: () => ({}) as Record<string, unknown>,
});

/** Access the `ctx.state` store, optionally typed with your app `State`. */
export function useState<S = Record<string, unknown>>():
  & ReturnType<typeof useStateStore>
  & S {
  return useStateStore() as ReturnType<typeof useStateStore> & S;
}
