/// <reference lib="dom" />
import { useCallback } from "react";
import { useAtomValue } from "jotai";
import { howlLocationAtom } from "./state.ts";

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
 * The current route. Read reactively with {@linkcode useRoute} — the value
 * updates (and consuming components re-render) on every navigation.
 */
export interface HowlRoute {
  /** Full href of the current location. */
  href: string;
  /** Pathname (no query / hash). */
  path: string;
  /** Query-string params as a flat record. */
  query: Record<string, string>;
  /** Matched route params (`/users/:id` → `{ id }`). */
  params: Record<string, string>;
  /** URL hash including the leading `#`, or `""` when absent. */
  hash: string;
  /** Matched route pattern (e.g. `/users/:id`), or `null`. */
  route: string | null;
}

/** The route value before any navigation is recorded (SSR/first-paint default). */
export const EMPTY_ROUTE: HowlRoute = {
  href: "",
  path: "",
  query: {},
  params: {},
  hash: "",
  route: null,
};

/** Parse `href` into a `URL`, returning `null` when it isn't a valid URL. */
function safeUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/**
 * Derive a {@linkcode HowlRoute} from a page-props bag. Shared by the server
 * engine (to seed the SSR atom) and the client boot (to update it on nav), so
 * both observe an identical route shape.
 */
export function toHowlRoute(props: Record<string, unknown>): HowlRoute {
  const raw = props.url;
  const url = raw instanceof URL ? raw : typeof raw === "string" ? safeUrl(raw) : null;
  return {
    href: url?.href ?? "",
    path: url?.pathname ?? "",
    query: (props.query as Record<string, string> | undefined) ??
      (url !== null ? Object.fromEntries(url.searchParams) : {}),
    params: (props.params as Record<string, string> | undefined) ?? {},
    hash: url?.hash ?? "",
    route: (props.route as string | null | undefined) ?? null,
  };
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
