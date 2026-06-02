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
 * esbuild plugin that wires React into a Howl build. Mirrors `vuePlugin()`:
 * register it via `new HowlBuilder(app, { plugins: [reactPlugin()] })`.
 *
 * It (1) declares that `.tsx`/`.jsx` routes render with the `"react"` engine (so
 * an app picks React over the built-in Preact just by registering this plugin —
 * they share `.tsx`), and (2) forces the client bundle's JSX to React's
 * automatic runtime, since the project root may default to Preact.
 */
export function reactPlugin(): Plugin {
  const plugin: Plugin = {
    name: "howl-react",
    setup(build) {
      build.initialOptions.jsx = "automatic";
      build.initialOptions.jsxImportSource = "react";
    },
  };
  // deno-lint-ignore no-explicit-any
  (plugin as any)[HOWL_ENGINE] = { extensions: [".tsx", ".jsx"], engine: "react" };
  return plugin;
}
