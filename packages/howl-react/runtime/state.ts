import { atom, type PrimitiveAtom, useAtomValue } from "jotai";
// Import from the dependency-free `./route.ts` leaf, NOT `./router.ts`:
// `router.ts` imports this module, so reading `EMPTY_ROUTE` from it here would
// re-create the cycle whose TDZ crashes the compiled/production build.
import { EMPTY_ROUTE, type HowlRoute } from "./route.ts";

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
 * The atom mirroring the current route. The engine seeds it on SSR and the
 * client boot re-seeds it on every navigation, so it always reflects the active
 * location. Prefer `useRoute()` from `@hushkey/howl-react/router` for reading it.
 */
export const howlLocationAtom: PrimitiveAtom<HowlRoute> = atom<HowlRoute>(EMPTY_ROUTE);

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
