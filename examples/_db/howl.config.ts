import { defineConfig } from "@hushkey/howl/api";

/** Minimal per-request state for the _db example. */
export interface State {
  user: {
    first_name: string;
    last_name: string;
  };
}

export const roles = ["USER"] as const;
export type Role = typeof roles[number];

export const { defineApi, config: apiConfig } = defineConfig<State, Role>({
  roles,
});
