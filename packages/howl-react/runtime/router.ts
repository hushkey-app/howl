import { useCallback } from "react";
import { useAtomValue } from "jotai";
import { howlLocationAtom } from "./state.ts";
import type { HowlRoute } from "./route.ts";

// The route value/shape primitives live in the dependency-free `./route.ts`
// leaf so `./state.ts` can read `EMPTY_ROUTE` at eval time without forming a
// `router.ts` ↔ `state.ts` cycle (see the note in `./route.ts`). Re-exported
// here to keep the public `@hushkey/howl-react/router` surface unchanged.
export { EMPTY_ROUTE, toHowlRoute } from "./route.ts";
export type { HowlRoute } from "./route.ts";

/** Options for an imperative {@linkcode navigate}. */
export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Scroll to the top after navigating. Defaults to `true`. */
  scroll?: boolean;
  /** Arbitrary value attached to the new `history.state` entry. */
  state?: unknown;
}

/**
 * The client navigation implementation, wired by the engine boot on hydration.
 * Kept behind this slot so page modules can import the router API without
 * pulling the (client-only) boot runtime into the server bundle.
 */
export interface HowlNavigator {
  /** Perform a navigation: a URL to push/replace, or a number to move through history. */
  go(to: string | number, opts: NavigateOptions): void;
}

let navigator: HowlNavigator | null = null;

/** Register the client navigation implementation. Called by the engine boot. */
export function registerNavigator(impl: HowlNavigator): void {
  navigator = impl;
}

/**
 * Navigate programmatically — from components, stores, or any client code.
 *
 * - `navigate("/about")` pushes a new history entry and client-renders the page.
 * - `navigate("/about", { replace: true })` replaces the current entry.
 * - `navigate(-1)` / `navigate(1)` move back / forward through history.
 *
 * Before hydration (or during SSR) it falls back to a full document navigation,
 * so it is always safe to call.
 *
 * ```tsx
 * import { navigate } from "@hushkey/howl-react/router";
 * navigate("/dashboard", { replace: true });
 * ```
 */
export function navigate(to: string | number, opts: NavigateOptions = {}): void {
  if (navigator !== null) {
    navigator.go(to, opts);
    return;
  }
  if (typeof to === "string" && typeof location !== "undefined") {
    if (opts.replace) location.replace(to);
    else location.assign(to);
  }
}

/** Go back one entry in history — shorthand for `navigate(-1)`. */
export function back(): void {
  navigate(-1);
}

/** Go forward one entry in history — shorthand for `navigate(1)`. */
export function forward(): void {
  navigate(1);
}

/** A stable imperative navigation function, mirroring `navigate`'s signature. */
export type NavigateFn = (to: string | number, opts?: NavigateOptions) => void;

/**
 * Returns a stable {@linkcode navigate} function for use inside components.
 *
 * ```tsx
 * import { useNavigate } from "@hushkey/howl-react/router";
 * const navigate = useNavigate();
 * <button onClick={() => navigate("/next")}>Next</button>;
 * ```
 */
export function useNavigate(): NavigateFn {
  return useCallback<NavigateFn>((to, opts) => navigate(to, opts), []);
}

/**
 * Read the current {@linkcode HowlRoute} reactively. The component re-renders
 * whenever the route changes (link click, programmatic nav, or back/forward).
 *
 * ```tsx
 * import { useRoute } from "@hushkey/howl-react/router";
 * const { path, params, query } = useRoute();
 * ```
 */
export function useRoute(): HowlRoute {
  return useAtomValue(howlLocationAtom);
}
