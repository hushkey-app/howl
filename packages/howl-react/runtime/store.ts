/**
 * Jotai atom helpers, re-exported via a **lightweight** entry
 * (`@hushkey/howl-react/store`) so importing them into a `.tsx` page or a store
 * file doesn't pull the engine's `react-dom/server` / esbuild that the main
 * `mod.ts` re-exports.
 *
 * Define an atom once (module scope) and read it anywhere — no prop-drilling.
 * Howl installs a jotai `Provider` around the tree on both server and client:
 * the server uses a fresh per-request store (so atoms never leak across
 * requests), the client a single session store (so atoms persist across
 * client-nav).
 *
 * ```ts
 * // store/index.store.ts
 * import { atom } from "@hushkey/howl-react/store";
 * export const countAtom = atom(0);
 *
 * // a page
 * import { useAtom } from "@hushkey/howl-react/store";
 * const [count, setCount] = useAtom(countAtom);
 * ```
 *
 * To carry an atom's value across the SSR→client boundary (the jotai analogue
 * of a named Pinia store), declare it with {@linkcode howlAtom} instead — its
 * value is serialized on SSR and hydrated on the client before first paint.
 * Seed it from server data during SSR with {@linkcode useHydrateAtoms}.
 */
export { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
export { useHydrateAtoms } from "jotai/utils";
export type { Atom, PrimitiveAtom, WritableAtom } from "jotai";
export { howlAtom } from "./serialize.ts";
