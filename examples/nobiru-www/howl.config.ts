import { defineConfig } from "@hushkey/howl/api";

export interface State {
  client: {
    title: string;
    version: string;
    appStoreUrl: string;
    price: string;
  };
}

export const roles = ["USER"] as const;
export type Role = typeof roles[number];

export const { defineApi, config: apiConfig } = defineConfig<State, Role>({
  roles,
});
