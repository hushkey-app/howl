/**
 * `@hushkey/howl-preact` — Howl's built-in **Preact** render engine, packaged
 * as a selectable engine alongside `@hushkey/howl-vue` / `@hushkey/howl-react`.
 *
 * Register it on the app (engines are explicit — Howl has no implicit default):
 *
 * ```ts
 * import { Howl } from "@hushkey/howl";
 * import { preactEngine } from "@hushkey/howl-preact";
 * const app = new Howl({ engines: { preact: preactEngine() } });
 * ```
 *
 * The Preact client runtime (hydration, partial/AOT client-nav, islands) ships
 * with `@hushkey/howl` core — Preact is the framework's native substrate — so
 * this package is the **server engine + plugin**; the Vue/React packages also
 * carry their own client `boot` because their runtime isn't built in.
 *
 * @module
 */
export { preactEngine } from "./engine.ts";

// Convenience re-exports of the Preact authoring surface (implemented in core),
// so a Preact app can import everything it needs from one modular entry.
export { ClientOnly, IS_BROWSER, IS_SERVER } from "@hushkey/howl";
export type { PageProps } from "@hushkey/howl";
