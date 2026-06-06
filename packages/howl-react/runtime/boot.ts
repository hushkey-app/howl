/// <reference lib="dom" />
import { type ComponentType, createElement, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { createHead, UnheadProvider } from "@unhead/react/client";
import { createStore, Provider as JotaiProvider } from "jotai";
import { composeReactTree } from "./compose.ts";
import { howlLocationAtom, howlStateAtom } from "./state.ts";
import { loadSerializableAtoms } from "./serialize.ts";
import { type NavigateOptions, registerNavigator, toHowlRoute } from "./router.ts";

// deno-lint-ignore no-explicit-any
type AnyComponent = ComponentType<any>;

// One head instance for the session — unhead keeps `document.head` in sync as
// pages render across client-nav, so per-page title/meta update on navigation.
const head = createHead();

// One jotai store for the session — seeded from the SSR state, then re-seeded on
// every client-nav so `useHowlState()` tracks `ctx.state`; user atoms persist.
const store = createStore();

/** Push the latest `ctx.state` into the session store (called on nav). */
function syncState(props: Record<string, unknown>): void {
  if (props.state !== undefined) {
    store.set(howlStateAtom, props.state as Record<string, unknown>);
  }
}

/** Push the current route into the session store so `useRoute()` re-renders. */
function syncLocation(props: Record<string, unknown>): void {
  store.set(howlLocationAtom, toHowlRoute(props));
}

/** Wrap a page tree in the session's jotai + unhead providers. */
function withProviders(tree: ReactNode): ReactNode {
  return createElement(
    JotaiProvider,
    { store },
    createElement(
      UnheadProvider as ComponentType<{ value: unknown; children: ReactNode }>,
      { value: head, children: tree },
    ),
  );
}

declare global {
  var __REACT_PAGE_PROPS__: Record<string, unknown> | undefined;
  /** AOT routes: route pattern (`/about/:id`) → client chunk URL. */
  var __HOWL_REACT_AOT__: Record<string, string> | undefined;
  /** Serialized `howlAtom` values from SSR: atom key → value. */
  var __HOWL_REACT_STORE__: Record<string, unknown> | undefined;
}

const HOWL_APP_ID = "howl-app";
const CLIENT_NAV_ATTR = "client-nav";
const PREFETCH_ATTR = "client-prefetch";
const PAGE_SCRIPT_ATTR = "data-howl-react-page";
const PROPS_SCRIPT_ATTR = "data-howl-react-props";
const PROPS_PREFIX = "window.__REACT_PAGE_PROPS__=";
const HOVER_INTENT_MS = 65;
const PREFETCH_TTL_MS = 30_000;
// Mirrors `@hushkey/howl`'s PARTIAL_SEARCH_PARAM — appended to client-nav fetches
// so the server marks `ctx.isPartial`. Hardcoded to keep core out of the bundle.
const PARTIAL_PARAM = "howl-partial";

/** The URL to fetch for a client-nav: destination + partial marker. The cache
 * and history stay keyed on the clean href. */
function partialFetchUrl(href: string): string {
  const u = new URL(href, location.origin);
  u.searchParams.set(PARTIAL_PARAM, "true");
  return u.href;
}

// One React root for the session — created on first paint (hydration), then
// re-rendered on client-nav so anything outside `#howl-app` (the `_app.tsx`
// shell) stays alive.
let root: Root | null = null;
let intentTimer: ReturnType<typeof setTimeout> | undefined;
let intentLink: HTMLAnchorElement | null = null;
const prefetchCache = new Map<string, { job: Promise<string>; ts: number }>();

/** Revive `url` (serialized to its href string) back into a real `URL`. */
function reviveProps(raw: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw.url === "string") {
    try {
      return { ...raw, url: new URL(raw.url) };
    } catch {
      // keep the string
    }
  }
  return raw;
}

/**
 * Hydrate the React page tree into `#howl-app` on first paint (the `_app.tsx`
 * shell is static markup, not hydrated). `components` is `[…Layouts, Page]`.
 */
export function hydrateReactPage(components: AnyComponent[]): void {
  const el = document.getElementById(HOWL_APP_ID);
  if (el === null) return;
  const props = reviveProps(globalThis.__REACT_PAGE_PROPS__ ?? {});
  syncState(props);
  syncLocation(props);
  // Rehydrate `howlAtom`s from their SSR values before the first render so the
  // markup matches (no hydration flash). Only on first paint — user atoms then
  // persist across client-nav, like Pinia stores (only `state` re-syncs on nav).
  if (globalThis.__HOWL_REACT_STORE__ !== undefined) {
    loadSerializableAtoms(store, globalThis.__HOWL_REACT_STORE__);
  }
  root = hydrateRoot(el, withProviders(composeReactTree(components, props)));
}

/**
 * Re-render the page tree on the existing root with fresh props (client-nav).
 * Falls back to hydration if the root isn't up yet.
 */
export function renderReactPage(
  components: AnyComponent[],
  props: Record<string, unknown>,
): void {
  if (root === null) {
    globalThis.__REACT_PAGE_PROPS__ = props;
    hydrateReactPage(components);
    return;
  }
  const revived = reviveProps(props);
  syncState(revived);
  syncLocation(revived);
  root.render(withProviders(composeReactTree(components, revived)));
}

/**
 * Render an AOT route on the client with props derived purely on the client —
 * **no server fetch**. Called by an AOT page chunk's exported `aotMount(props)`.
 * The page's `useHead()` runs during this render, so title/meta update too.
 */
export function aotMountReactPage(
  components: AnyComponent[],
  props: Record<string, unknown>,
): void {
  globalThis.__REACT_PAGE_PROPS__ = props;
  renderReactPage(components, props);
}

/** Whether `el` sits inside a `client-nav` boundary that isn't disabled. */
function clientNavEnabled(el: Element): boolean {
  const setting = el.closest(`[${CLIENT_NAV_ATTR}]`);
  return setting !== null && setting.getAttribute(CLIENT_NAV_ATTR) !== "false";
}

/** Resolve a same-origin, internal, client-navigable anchor from an event target. */
function eligibleAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const a = target.closest("a");
  if (!(a instanceof HTMLAnchorElement) || a.href === "") return null;
  if (a.origin !== location.origin || (a.target && a.target !== "_self")) return null;
  if (a.getAttribute("href")?.startsWith("#")) return null;
  if (!clientNavEnabled(a)) return null;
  return a;
}

/** Respect the user's data-saver preference — never prefetch speculatively. */
function saveDataEnabled(): boolean {
  // deno-lint-ignore no-explicit-any
  const conn = (navigator as any).connection;
  if (conn && conn.saveData === true) return true;
  return globalThis.matchMedia?.("(prefers-reduced-data: reduce)").matches ?? false;
}

/** Prefetch is opt-in via a `client-prefetch` boundary (off by default). */
function prefetchEnabled(a: HTMLAnchorElement): boolean {
  const setting = a.closest(`[${PREFETCH_ATTR}]`);
  return setting !== null && setting.getAttribute(PREFETCH_ATTR) !== "false";
}

/** Add a `<link rel="modulepreload">` for `url` once. */
function modulePreload(url: string): void {
  if (document.head.querySelector(`link[rel="modulepreload"][href="${url}"]`) !== null) return;
  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = url;
  document.head.appendChild(link);
}

/** Warm a destination on intent: for an AOT route just modulepreload its chunk
 * (no server fetch); otherwise warm the SSR HTML so a later swap is instant. */
function prefetchPage(href: string): void {
  if (href === location.href || saveDataEnabled()) return;
  const match = matchAot(new URL(href, location.origin).pathname);
  if (match !== null) {
    modulePreload(match.route.chunk);
    return;
  }
  const existing = prefetchCache.get(href);
  if (existing !== undefined && Date.now() - existing.ts < PREFETCH_TTL_MS) return;
  const job = fetch(partialFetchUrl(href), { headers: { Accept: "text/html" } }).then((res) => {
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
      res.body?.cancel();
      throw new Error("non-html");
    }
    return res.text();
  });
  prefetchCache.set(href, { job, ts: Date.now() });
  job.then((html) => {
    const m = html.match(/data-chunk="([^"]+)"/);
    if (m !== null) modulePreload(m[1]);
  }).catch(() => prefetchCache.delete(href));
}

/** Load a destination's SSR HTML, reusing a fresh hover-warmed copy when present. */
async function loadPageHtml(href: string): Promise<string | null> {
  const warmed = prefetchCache.get(href);
  if (warmed !== undefined) {
    prefetchCache.delete(href);
    if (Date.now() - warmed.ts < PREFETCH_TTL_MS) {
      try {
        return await warmed.job;
      } catch {
        // fall through to a fresh request
      }
    }
  }
  let res: Response;
  try {
    res = await fetch(partialFetchUrl(href), { headers: { Accept: "text/html" } });
  } catch {
    return null;
  }
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
    res.body?.cancel();
    return null;
  }
  return await res.text();
}

/** How a client navigation should touch the history stack and scroll. */
interface NavIntent {
  /** `push` adds an entry, `replace` swaps the current one, `none` leaves it. */
  history: "push" | "replace" | "none";
  /** Whether to reset scroll to the top after the swap. */
  scroll: boolean;
  /** Value to attach to the new `history.state` entry. */
  state?: unknown;
}

/** Apply `intent` to the history stack for `href`, tagging the entry for popstate. */
function applyHistory(intent: NavIntent, href: string): void {
  const entry = { howlReact: true, navState: intent.state };
  if (intent.history === "push") history.pushState(entry, "", href);
  else if (intent.history === "replace") history.replaceState(entry, "", href);
}

/**
 * Client-side navigation: fetch the destination's SSR HTML, import its page
 * chunk, and re-render the page tree on the existing root — no full reload.
 * Falls back to a full navigation for non-HTML / non-Howl-React responses.
 */
async function navigateReactPage(url: URL, intent: NavIntent): Promise<void> {
  const html = await loadPageHtml(url.href);
  if (html === null) {
    location.assign(url.href);
    return;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const pageScript = doc.querySelector<HTMLScriptElement>(`script[${PAGE_SCRIPT_ATTR}]`);
  if (pageScript === null) {
    location.assign(url.href); // not a client-navigable React page
    return;
  }

  let nextProps: Record<string, unknown> = {};
  const propsText = doc.querySelector(`script[${PROPS_SCRIPT_ATTR}]`)?.textContent ?? "";
  if (propsText.startsWith(PROPS_PREFIX)) {
    try {
      nextProps = JSON.parse(propsText.slice(PROPS_PREFIX.length));
    } catch {
      // keep empty props
    }
  }

  // Import the page chunk before touching the DOM (atomic title + re-render).
  const chunk = pageScript.getAttribute("data-chunk");
  const mod = chunk !== null
    ? await import(chunk) as { render?: (p: Record<string, unknown>) => void }
    : null;

  if (doc.title) document.title = doc.title;
  // Push the URL the server actually rendered (handles redirects), else the
  // requested URL.
  const landed = typeof nextProps.url === "string" ? nextProps.url : url.href;
  applyHistory(intent, landed);
  if (intent.scroll) scrollTo({ top: 0, left: 0, behavior: "instant" });

  globalThis.__REACT_PAGE_PROPS__ = nextProps;
  mod?.render?.(nextProps);
}

// --- AOT navigation: client-render a `__`/`___`-prefixed route, no server hop ---

interface AotRoute {
  pattern: string;
  chunk: string;
  re: RegExp;
  keys: string[];
}
let aotRoutes: AotRoute[] | null = null;

/** Compile the `__HOWL_REACT_AOT__` manifest (pattern → chunk) into matchers:
 * each `:param` becomes a capture group; non-matching patterns fall to SSR nav. */
function getAotRoutes(): AotRoute[] {
  if (aotRoutes === null) {
    aotRoutes = Object.entries(globalThis.__HOWL_REACT_AOT__ ?? {}).map(
      ([pattern, chunk]) => {
        const keys: string[] = [];
        const source = pattern
          .replace(/:[A-Za-z0-9_]+/g, (m) => (keys.push(m.slice(1)), "([^/]+)"))
          .replace(/\//g, "\\/");
        return { pattern, chunk, re: new RegExp(`^${source}\\/?$`), keys };
      },
    );
  }
  return aotRoutes;
}

/** Match a pathname against the AOT routes, returning the route + its params. */
function matchAot(
  pathname: string,
): { route: AotRoute; params: Record<string, string> } | null {
  for (const route of getAotRoutes()) {
    const m = route.re.exec(pathname);
    if (m === null) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return { route, params };
  }
  return null;
}

/** State for an AOT render — the session store's `ctx.state` mirror (set on the
 * last SSR/nav), falling back to the last page props' `state`. */
function currentState(): unknown {
  const s = store.get(howlStateAtom);
  if (s !== undefined && Object.keys(s).length > 0) return s;
  return (globalThis.__REACT_PAGE_PROPS__ as { state?: unknown } | undefined)?.state;
}

/**
 * Navigate to an AOT route by client-rendering its chunk with props derived on
 * the client (URL, route params, persisted state) — no SSR-HTML fetch. `data` is
 * left undefined; AOT pages fetch their own data on the client.
 */
async function aotNavigate(
  url: URL,
  intent: NavIntent,
  match: { route: AotRoute; params: Record<string, string> },
): Promise<void> {
  const props: Record<string, unknown> = {
    url: url.href,
    params: match.params,
    query: Object.fromEntries(url.searchParams),
    route: match.route.pattern,
    isPartial: true,
    state: currentState(),
    data: undefined,
    error: null,
  };
  const mod = await import(match.route.chunk) as {
    aotMount?: (p: Record<string, unknown>) => void;
  };
  if (mod.aotMount === undefined) {
    location.assign(url.href); // chunk lacks AOT support — full load
    return;
  }
  applyHistory(intent, url.href);
  if (intent.scroll) scrollTo({ top: 0, left: 0, behavior: "instant" });
  mod.aotMount(props);
}

/** Dispatch a client navigation: AOT (client-render) when the destination is an
 * AOT route, else the SSR-HTML fetch-and-swap path. */
function navigateTo(url: URL, intent: NavIntent): void {
  const match = matchAot(url.pathname);
  if (match !== null) void aotNavigate(url, intent, match);
  else void navigateReactPage(url, intent);
}

if (typeof document !== "undefined") {
  // Tag the initial history entry so Back to it triggers a client re-render.
  if (
    document.body !== null && clientNavEnabled(document.body) &&
    !(history.state as { howlReact?: boolean } | null)?.howlReact
  ) {
    history.replaceState({ howlReact: true }, "", location.href);
  }

  document.addEventListener("click", (e) => {
    if (
      e.defaultPrevented || e.button !== 0 ||
      e.ctrlKey || e.metaKey || e.altKey || e.shiftKey
    ) return;
    const a = eligibleAnchor(e.target);
    if (a === null) return;
    e.preventDefault();
    if (a.href !== location.href) {
      navigateTo(new URL(a.href), { history: "push", scroll: true });
    }
  });

  addEventListener("popstate", (e) => {
    if ((e.state as { howlReact?: boolean } | null)?.howlReact) {
      navigateTo(new URL(location.href), { history: "none", scroll: true });
    }
  });

  // Imperative navigation: `navigate()` / `useNavigate()` route through the same
  // AOT/SSR swap path as link clicks, bypassing the `client-nav` boundary check.
  registerNavigator({
    go(to: string | number, opts: NavigateOptions) {
      if (typeof to === "number") {
        history.go(to);
        return;
      }
      navigateTo(new URL(to, location.href), {
        history: opts.replace ? "replace" : "push",
        scroll: opts.scroll ?? true,
        state: opts.state,
      });
    },
  });

  // Prefetch on intent (hover dwell / touch / focus), opt-in via client-prefetch.
  const warm = (target: EventTarget | null) => {
    const a = eligibleAnchor(target);
    if (a !== null && prefetchEnabled(a)) prefetchPage(a.href);
  };
  document.addEventListener("pointerover", (e) => {
    const a = eligibleAnchor(e.target);
    if (a === null || !prefetchEnabled(a)) return;
    intentLink = a;
    clearTimeout(intentTimer);
    intentTimer = setTimeout(() => {
      if (intentLink !== null) prefetchPage(intentLink.href);
    }, HOVER_INTENT_MS);
  });
  document.addEventListener("pointerout", () => {
    clearTimeout(intentTimer);
    intentLink = null;
  });
  document.addEventListener("touchstart", (e) => warm(e.target), { passive: true });
  document.addEventListener("focusin", (e) => warm(e.target));
}
