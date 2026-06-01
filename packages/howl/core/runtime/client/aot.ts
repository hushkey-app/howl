import { type ComponentType, h } from "preact";
import { ACTIVE_PARTIALS } from "./reviver.ts";
import { type HowlHistoryState, updateLinks } from "./partials.ts";
import { isClientNavOptedIn } from "../shared_internal.ts";

interface AotChunk {
  Component: ComponentType<
    { url: URL; params: Record<string, string>; state: unknown }
  >;
  route: string;
}

declare global {
  var __HOWL_AOT__: Record<string, string> | undefined;
}

const manifest = (typeof globalThis !== "undefined" && globalThis.__HOWL_AOT__) || {};
const chunkCache = new Map<string, Promise<AotChunk>>();

// Monotonic token: each call to tryAotNavigate stamps its token, and any
// awaited chunk-load that resolves with an out-of-date token is dropped on
// the floor. Without this, fast clicks while a previous chunk is still
// loading cause a flicker — the earlier setState commits *after* the user
// has already moved on, briefly showing stale page content.
let navToken = 0;

function normalizePath(p: string): string {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

function matchRoute(pathname: string): { pattern: string; params: Record<string, string> } | null {
  const target = normalizePath(pathname);
  for (const pattern of Object.keys(manifest)) {
    const normalized = normalizePath(pattern);
    try {
      const up = new URLPattern({ pathname: normalized });
      const exec = up.exec({ pathname: target });
      if (!exec) continue;
      const groups = exec.pathname.groups ?? {};
      const params: Record<string, string> = {};
      for (const k of Object.keys(groups)) {
        const v = groups[k];
        if (typeof v === "string") params[k] = v;
      }
      return { pattern, params };
    } catch {
      // invalid pattern — skip
    }
  }
  return null;
}

function loadChunk(pattern: string): Promise<AotChunk> {
  let p = chunkCache.get(pattern);
  if (!p) {
    p = import(manifest[pattern]) as Promise<AotChunk>;
    chunkCache.set(pattern, p);
  }
  return p;
}

/**
 * Warm the chunk cache for an AOT-registered destination without navigating.
 * Called by the hover/focus prefetcher. Returns `true` when `url` matched an
 * AOT route (so the caller can skip SSR-partial prefetch), `false` otherwise.
 */
export function prefetchAotRoute(url: URL): boolean {
  if (Object.keys(manifest).length === 0) return false;
  const matched = matchRoute(url.pathname);
  if (!matched) return false;
  // Fire-and-forget; the import is memoised in chunkCache for the eventual click.
  loadChunk(matched.pattern).catch(() => {});
  return true;
}

/**
 * Resolve the destination URL to an AOT chunk, load it, and swap the page tree
 * into the existing hydrated PartialComp via setState. Reusing the same
 * PartialComp instance keeps the partials.ts machinery intact for subsequent
 * outbound navigation to non-AOT routes. Returns `false` when the route isn't
 * AOT-registered or no PartialComp is mounted.
 */
export async function tryAotNavigate(nextUrl: URL): Promise<boolean> {
  const matched = matchRoute(nextUrl.pathname);
  if (!matched) return false;

  // Stamp this navigation. A later click bumps the token, and once we resume
  // from `await loadChunk` we bail if the token's moved on — so the user's
  // most recent destination always wins instead of being overwritten by a
  // slow-loading earlier chunk.
  const myToken = ++navToken;

  // Pick any active partial — convention is one Partial per page (typically
  // named "main"); grab the first to stay name-agnostic.
  const partial = ACTIVE_PARTIALS.values().next().value;
  if (!partial) return false;

  const chunk = await loadChunk(matched.pattern);
  if (myToken !== navToken) return false; // superseded by a later click

  const tree = h(chunk.Component, {
    url: nextUrl,
    params: matched.params,
    state: (globalThis as unknown as { __HOWL_USER_STATE__?: unknown })
      .__HOWL_USER_STATE__ ?? {},
  });

  // Matches the SSR partial path: when the app opts in via `f-view-transition`
  // on <body>, wrap the DOM swap in `document.startViewTransition` so the
  // browser captures before/after snapshots and animates between them.
  // Resolves after the transition finishes; the click handler's post-nav
  // scroll then runs once animation is complete instead of mid-fade.
  const wantsTransition = typeof document !== "undefined" &&
    document.body?.hasAttribute("f-view-transition");
  // deno-lint-ignore no-explicit-any
  const startViewTransition = (document as any).startViewTransition?.bind(
    document,
  );

  const commit = () => {
    partial.props.children = tree;
    // setState is async (preact commits on a microtask). Re-stamp data-current
    // / data-ancestor in the commit callback so we run after the chunk's new
    // <a> vnodes — which carry no data attributes — have replaced the old DOM.
    // Running before commit would let preact overwrite our stamps.
    return new Promise<void>((resolve) => {
      partial.setState({}, () => {
        updateLinks(nextUrl);
        resolve();
      });
    });
  };

  if (wantsTransition && typeof startViewTransition === "function") {
    await startViewTransition(commit).finished;
  } else {
    await commit();
  }
  return true;
}

if (typeof document !== "undefined" && Object.keys(manifest).length > 0) {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    let el = e.target as HTMLElement | null;
    if (!el) return;
    if (el.nodeName !== "A") el = el.closest("a");
    if (!(el instanceof HTMLAnchorElement)) return;
    if (
      el.target && el.target !== "_self" ||
      el.origin !== location.origin ||
      e.button !== 0 ||
      e.ctrlKey || e.metaKey || e.altKey || e.shiftKey
    ) return;

    // `f-client-nav` gates AOT the same way it gates the SSR partial nav.
    // When the user removes the attribute (or sets it to "false") the AOT
    // navigator must stand down and let the browser perform a regular
    // document-level navigation, otherwise removing `f-client-nav` would
    // half-work — SSR routes reload, AOT routes stay SPA.
    if (!isClientNavOptedIn(el)) return;

    const nextUrl = new URL(el.href);
    const matched = matchRoute(nextUrl.pathname);
    if (!matched) return; // fall through to partials.ts for SSR routes

    // Skip no-op navigations to the same URL — pushing duplicate history
    // entries and re-mounting components causes visible flicker.
    if (nextUrl.href === location.href) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    const state: HowlHistoryState = {
      fClientNav: true,
      index: (history.state?.index ?? 0) + 1,
      scrollX: 0,
      scrollY: 0,
    };
    history.pushState(state, "", nextUrl.href);
    tryAotNavigate(nextUrl).then(() => {
      scrollTo({ left: 0, top: 0, behavior: "instant" });
    });
  }, true);

  addEventListener("popstate", (e) => {
    if (e.state === null) return;
    // Same gating rule as the click path: when `f-client-nav` is missing or
    // explicitly disabled at the body level, defer to the browser instead of
    // intercepting back/forward.
    if (!document.body || !isClientNavOptedIn(document.body)) return;
    const url = new URL(location.href);
    const matched = matchRoute(url.pathname);
    if (!matched) return; // partials.ts handles popstate for SSR routes
    e.stopImmediatePropagation();
    tryAotNavigate(url);
  });
}
