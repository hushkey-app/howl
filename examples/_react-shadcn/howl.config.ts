import { defineConfig } from "@hushkey/howl/api";

/** Minimal per-request state for the shadcn/ui example. */
export interface State {
  title: string;
}

export const roles = ["USER"] as const;
export type Role = typeof roles[number];

export const { defineApi, config: apiConfig } = defineConfig<State, Role>({
  roles,
});
