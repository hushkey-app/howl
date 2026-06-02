/// <reference lib="dom" />
import { type ComponentType, createElement, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { createHead, UnheadProvider } from "@unhead/react/client";
import { createStore, Provider as JotaiProvider } from "jotai";
import { composeReactTree } from "./compose.ts";
import { howlStateAtom } from "./state.ts";

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
  root.render(withProviders(composeReactTree(components, revived)));
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

/** Warm the SSR HTML for `href` (and modulepreload its chunk) on intent. */
function prefetchPage(href: string): void {
  if (href === location.href || saveDataEnabled()) return;
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

/**
 * Client-side navigation: fetch the destination's SSR HTML, import its page
 * chunk, and re-render the page tree on the existing root — no full reload.
 * Falls back to a full navigation for non-HTML / non-Howl-React responses.
 */
async function navigateReactPage(url: URL, push: boolean): Promise<void> {
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
  if (push) history.pushState({ howlReact: true }, "", landed);
  scrollTo({ top: 0, left: 0, behavior: "instant" });

  globalThis.__REACT_PAGE_PROPS__ = nextProps;
  mod?.render?.(nextProps);
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
    if (a.href !== location.href) navigateReactPage(new URL(a.href), true);
  });

  addEventListener("popstate", (e) => {
    if ((e.state as { howlReact?: boolean } | null)?.howlReact) {
      navigateReactPage(new URL(location.href), false);
    }
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
