/**
 * `@hushkey/howl-react` — render React `.tsx` pages with Howl's pluggable render
 * engine, alongside (or instead of) the built-in Preact renderer.
 *
 * @module
 */
export { reactEngine, type ReactEngineOptions, type ReactPageProps } from "./engine.ts";
export { renderToString } from "./runtime/render.ts";
