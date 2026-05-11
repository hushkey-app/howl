import { type ComponentType, h } from "preact";
import { ACTIVE_PARTIALS } from "./reviver.ts";
import type { HowlHistoryState } from "./partials.ts";

interface AotChunk {
  Component: ComponentType<
    { url: URL; params: Record<string, string>; state: unknown }
  >;
  route: string;
}

declare global {
  // deno-lint-ignore no-var
  var __HOWL_AOT__: Record<string, string> | undefined;
}

const manifest = (typeof globalThis !== "undefined" && globalThis.__HOWL_AOT__) || {};
const chunkCache = new Map<string, Promise<AotChunk>>();

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
 * Resolve the destination URL to an AOT chunk, load it, and swap the page tree
 * into the existing hydrated PartialComp via setState. Reusing the same
 * PartialComp instance keeps the partials.ts machinery intact for subsequent
 * outbound navigation to non-AOT routes. Returns `false` when the route isn't
 * AOT-registered or no PartialComp is mounted.
 */
export async function tryAotNavigate(nextUrl: URL): Promise<boolean> {
  const matched = matchRoute(nextUrl.pathname);
  if (!matched) return false;

  // Pick any active partial — convention is one Partial per page (typically
  // named "main"); grab the first to stay name-agnostic.
  const partial = ACTIVE_PARTIALS.values().next().value;
  if (!partial) return false;

  const chunk = await loadChunk(matched.pattern);
  const tree = h(chunk.Component, {
    url: nextUrl,
    params: matched.params,
    state: (globalThis as unknown as { __HOWL_USER_STATE__?: unknown })
      .__HOWL_USER_STATE__ ?? {},
  });
  partial.props.children = tree;
  partial.setState({});
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
    const url = new URL(location.href);
    const matched = matchRoute(url.pathname);
    if (!matched) return; // partials.ts handles popstate for SSR routes
    e.stopImmediatePropagation();
    tryAotNavigate(url);
  });
}
