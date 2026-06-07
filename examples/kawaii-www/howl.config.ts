import { defineConfig } from "@hushkey/howl/api";

/** Per-request state for the kawaii(x,y) example. */
export interface State {
  client: {
    /** Document title fallback (used by the Vue engine + `useHead`). */
    title: string;
    /** Active colour theme, resolved from the `theme` cookie by middleware. */
    theme: "light" | "dark";
  };
}

export const roles = ["USER"] as const;
export type Role = typeof roles[number];

export const { defineApi, config: apiConfig } = defineConfig<State, Role>({
  roles,
});
