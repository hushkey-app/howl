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
 */
export { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
export type { Atom, PrimitiveAtom, WritableAtom } from "jotai";
