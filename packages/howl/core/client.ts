/**
 * Client-safe entry point. Re-exports utilities that are usable in island
 * bundles without pulling in server-only modules (build cache, fs adapter,
 * the `Howl` app class, etc.). Import from `@hushkey/howl/client` inside
 * `*.island.tsx` files.
 *
 * @module
 */
export { IS_BROWSER, IS_SERVER } from "./guards.ts";
