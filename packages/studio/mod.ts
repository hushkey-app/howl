/**
 * `@hushkey/studio` — admin UI for `@hushkey/service-core` services, one tool
 * across every backend (Mongo, Postgres, SQLite, …).
 *
 * Unlike a wire-protocol bridge, the studio speaks the service contract:
 * every write validates against the schema, bumps the optimistic-lock
 * version, stamps audit fields, and respects soft delete — exactly like any
 * other caller.
 *
 * Two modes:
 * - **standalone** — `app.use(studio({ services }))` serves a complete
 *   dashboard at `/studio` (component bundled on first request, no build
 *   pipeline needed).
 * - **component** — the middleware mounts only the JSON API; render
 *   `<Studio />` from `@hushkey/studio/component` inside your own dashboard
 *   island.
 *
 * @module
 */
export { studio } from "./studio.ts";
export type { StudioContext, StudioOptions, StudioStyle } from "./studio.ts";
export * from "@hushkey/service-core";
