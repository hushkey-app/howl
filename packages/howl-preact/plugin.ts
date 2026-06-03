import type { Plugin } from "esbuild";

/**
 * Symbol key under which an esbuild plugin declares the Howl render engine it
 * provides (`{ extensions, engine }`). A symbol (not a string property) so
 * esbuild's plugin-option validation ignores it. `Symbol.for` makes it shared
 * across packages, so HowlBuilder reads the same key.
 */
export const HOWL_ENGINE: unique symbol = Symbol.for(
  "howl.engine",
) as typeof HOWL_ENGINE;

/**
 * esbuild plugin that maps `.tsx`/`.jsx` routes to the built-in `"preact"`
 * engine. Mirrors `vuePlugin()` / `reactPlugin()`: register it via
 * `new HowlBuilder(app, { plugins: [preactPlugin()] })`.
 *
 * Optional — Preact is the framework's native `.tsx` renderer, so a `.tsx`
 * route already falls back to it. Registering this plugin makes the choice
 * explicit (and keeps the dev story symmetric with the Vue/React packages). It
 * does **not** touch esbuild's JSX settings — the build already defaults to
 * Preact's `jsxImportSource`.
 */
export function preactPlugin(): Plugin {
  const plugin: Plugin = {
    name: "howl-preact",
    setup() {},
  };
  // deno-lint-ignore no-explicit-any
  (plugin as any)[HOWL_ENGINE] = { extensions: [".tsx", ".jsx"], engine: "preact" };
  return plugin;
}
