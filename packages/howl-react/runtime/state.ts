import { atom, type PrimitiveAtom, useAtomValue } from "jotai";

/**
 * The atom mirroring the server `ctx.state` — the request-scoped context Howl
 * shares between backend and frontend. The engine seeds it on SSR and re-seeds
 * it on every client navigation, so it always reflects the current request's
 * `ctx.state`. Prefer {@linkcode useHowlState} for reading it in components.
 */
export const howlStateAtom: PrimitiveAtom<Record<string, unknown>> = atom<
  Record<string, unknown>
>({});

/**
 * Read the `ctx.state` mirror anywhere in the tree — no prop-drilling —
 * reactively, optionally typed with your app `State`:
 *
 * ```tsx
 * import { useHowlState } from "@hushkey/howl-react/state";
 * const state = useHowlState<State>(); // state.title, state.user, …
 * ```
 */
export function useHowlState<S = Record<string, unknown>>(): S {
  return useAtomValue(howlStateAtom) as S;
}
