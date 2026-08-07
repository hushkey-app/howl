import { defineConfig } from "@hushkey/howl/api";

/**
 * Per-request state handed to every page. Only the `client` bag is serialised
 * into the page payload — keep it to values that are safe to publish.
 */
export interface State {
  /** Values mirrored into the hydration payload and readable from any page. */
  client: {
    /** Site owner's display name. */
    name: string;
    /** Canonical origin, used to build absolute OG/canonical URLs. */
    origin: string;
    /** Contact address shown to visitors. */
    email: string;
  };
}

/** Roles this site knows about. Nothing here is authenticated — it is a brochure. */
export const roles = ["USER"] as const;

/** A single role value. */
export type Role = typeof roles[number];

export const { defineApi, config: apiConfig } = defineConfig<State, Role>({
  roles,
});
