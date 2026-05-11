import { defineConfig } from "@hushkey/howl/api";

/**
 * Request-scoped state shared across middleware, pages, and APIs.
 *
 * On routes flagged for AOT (`__page.tsx`) or SSG (`___page.tsx`), this
 * object is also serialised into `window.__HOWL_USER_STATE__` so the client
 * runtime can seed signals/stores with the same data SSR rendered with.
 *
 * Keep it public-safe — anything you put here is exposed in HTML.
 */
export interface State {
  client: {
    title: string;
    appName: string;
  };
}

export const roles = ["USER"] as const;
export type Role = typeof roles[number];

export const { defineApi, config: apiConfig } = defineConfig<State, Role>({
  roles,
});
