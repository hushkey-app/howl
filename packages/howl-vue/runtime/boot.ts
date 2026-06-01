/// <reference lib="dom" />
import { type App, type Component, createSSRApp } from "vue";
import { createHead } from "@unhead/vue/client";
import { createPinia, type Pinia } from "pinia";
import { mountVueIsland } from "./mount.ts";
import { composeVueTree } from "./compose.ts";
import { VUE_ISLAND_ATTR, VUE_ISLAND_PROPS_ATTR } from "./host.ts";

// One head instance for the session — unhead keeps `document.head` in sync as
// pages mount/unmount across client-nav, so per-page title/meta update on nav.
const head = createHead();

declare global {
  var __HOWL_VUE__: Record<string, string> | undefined;
  var __VUE_PAGE_PROPS__: Record<string, unknown> | undefined;
  // deno-lint-ignore no-explicit-any
  var __PINIA__: Record<string, any> | undefined;
}

// One Pinia for the session — hydrated once from the SSR state, then kept across
// client-nav so stores persist (no reset on navigation).
let pinia: Pinia | null = null;
function getPinia(): Pinia {
  if (pinia === null) {
    pinia = createPinia();
    if (globalThis.__PINIA__ !== undefined) pinia.state.value = globalThis.__PINIA__;
  }
  return pinia;
}

const HOWL_APP_ID = "howl-app";
const CLIENT_NAV_ATTR = "client-nav";
const PREFETCH_ATTR = "client-prefetch";
const PAGE_SCRIPT_ATTR = "data-howl-vue-page";
const PROPS_SCRIPT_ATTR = "data-howl-vue-props";
const PROPS_PREFIX = "window.__VUE_PAGE_PROPS__=";
const HOVER_INTENT_MS = 65;
const PREFETCH_TTL_MS = 30_000;

let currentApp: App | null = null;
let intentTimer: ReturnType<typeof setTimeout> | undefined;
let intentLink: HTMLAnchorElement | null = null;
const prefetchCache = new Map<string, { job: Promise<string>; ts: number }>();

function unmountCurrent(): void {
  if (currentApp !== null) {
    try {
      currentApp.unmount();
    } catch {
      // previous app already detached
    }
    currentApp = null;
  }
}

/**
 * Mount (or re-mount) the Vue page tree into `#howl-app`. On first load this
 * hydrates the server-rendered markup; during client navigation it's called
 * again after the DOM + props have been swapped. `components` is the
 * `[…Layouts, Page]` chain (the `_app.vue` shell stays static and is not part
 * of this tree).
 */
export function hydrateVuePage(components: Component[]): void {
  const el = document.getElementById(HOWL_APP_ID);
  if (el === null) return;
  unmountCurrent();
  const props = globalThis.__VUE_PAGE_PROPS__ ?? {};
  currentApp = createSSRApp({ render: composeVueTree(components, props) });
  currentApp.use(head);
  if (document.body.hasAttribute("pinia")) currentApp.use(getPinia());
  currentApp.mount(el);
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

/**
 * Whether prefetch is enabled for `a` — opt in by putting `client-prefetch` on
 * a boundary (e.g. `<body>` or a region), like `client-nav`. Off by default;
 * a nested `client-prefetch="false"` excludes a link or subtree.
 */
function prefetchEnabled(a: HTMLAnchorElement): boolean {
  const setting = a.closest(`[${PREFETCH_ATTR}]`);
  return setting !== null && setting.getAttribute(PREFETCH_ATTR) !== "false";
}

/** Warm the SSR HTML for `href` so a later navigation reuses it (instant swap). */
function prefetchPage(href: string): void {
  if (href === location.href || saveDataEnabled()) return;
  const existing = prefetchCache.get(href);
  if (existing !== undefined && Date.now() - existing.ts < PREFETCH_TTL_MS) return;
  const job = fetch(href, {
    headers: { Accept: "text/html" },
    // deno-lint-ignore no-explicit-any
    ...({ priority: "low" } as any),
  }).then((res) => {
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
      res.body?.cancel();
      throw new Error("non-html");
    }
    return res.text();
  });
  prefetchCache.set(href, { job, ts: Date.now() });
  job.then(preloadPageChunk).catch(() => prefetchCache.delete(href));
}

/** Modulepreload a prefetched page's hydration chunk (+ its Vue deps) so the
 * eventual nav `import()` is a cache hit. */
function preloadPageChunk(html: string): void {
  const m = html.match(/data-chunk="([^"]+)"/);
  if (m === null) return;
  const href = m[1];
  if (document.head.querySelector(`link[rel="modulepreload"][href="${href}"]`) !== null) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = href;
  document.head.appendChild(link);
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
        // warmed fetch failed — fall through to a fresh request
      }
    }
  }
  let res: Response;
  try {
    res = await fetch(href, { headers: { Accept: "text/html" } });
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
 * Client-side navigation for Vue pages: fetch the destination's SSR HTML, swap
 * the `#howl-app` region + its props/styles/title in place, and re-hydrate —
 * no full reload, so anything outside `#howl-app` (the `_app.vue` shell, module
 * singletons like a store) stays alive. Falls back to a full browser
 * navigation for non-HTML responses or pages without a `#howl-app` target.
 */
async function navigateVuePage(url: URL, push: boolean): Promise<void> {
  const html = await loadPageHtml(url.href);
  if (html === null) {
    location.assign(url.href);
    return;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const incoming = doc.getElementById(HOWL_APP_ID);
  const el = document.getElementById(HOWL_APP_ID);
  const pageScript = doc.querySelector<HTMLScriptElement>(`script[${PAGE_SCRIPT_ATTR}]`);
  if (incoming === null || el === null || pageScript === null) {
    location.assign(url.href); // not a client-navigable Vue page
    return;
  }

  let nextProps: Record<string, unknown> = {};
  const propsScript = doc.querySelector(`script[${PROPS_SCRIPT_ATTR}]`);
  const propsText = propsScript?.textContent ?? "";
  if (propsText.startsWith(PROPS_PREFIX)) {
    try {
      nextProps = JSON.parse(propsText.slice(PROPS_PREFIX.length));
    } catch {
      // keep empty props
    }
  }

  unmountCurrent();
  el.innerHTML = incoming.innerHTML;
  globalThis.__VUE_PAGE_PROPS__ = nextProps;

  // Re-sync the `state` store with the new request's ctx.state (other stores
  // persist across nav — only this one tracks the server context).
  if (document.body.hasAttribute("pinia")) {
    const piniaText = doc.querySelector("script[data-howl-pinia]")?.textContent ?? "";
    const prefix = "window.__PINIA__=";
    if (piniaText.startsWith(prefix)) {
      try {
        const next = JSON.parse(piniaText.slice(prefix.length));
        if (next !== null && typeof next === "object" && "state" in next) {
          getPinia().state.value.state = next.state;
        }
      } catch {
        // keep existing state
      }
    }
  }

  // Swap the inlined page CSS (`<style data-howl-vue-css>`) with the new page's.
  const nextCss = doc.querySelector("style[data-howl-vue-css]");
  const prevCss = document.head.querySelector("style[data-howl-vue-css]");
  if (nextCss !== null) {
    const clone = nextCss.cloneNode(true);
    if (prevCss !== null) prevCss.replaceWith(clone);
    else document.head.appendChild(clone);
  } else if (prevCss !== null) {
    prevCss.remove();
  }

  doc.querySelectorAll("link[rel=stylesheet]").forEach((link) => {
    const href = link.getAttribute("href");
    if (href !== null && document.head.querySelector(`link[href="${href}"]`) === null) {
      document.head.appendChild(link.cloneNode(true));
    }
  });
  if (doc.title) document.title = doc.title;

  if (push) history.pushState({ howlVue: true }, "", url.href);
  scrollTo({ top: 0, left: 0, behavior: "instant" });

  // Import the page chunk (a cache hit when it was preloaded on hover) and run
  // its exported hydrate(). Stable URL — no cache-bust — so the preload applies
  // and revisits reuse the loaded module.
  const chunk = pageScript.getAttribute("data-chunk");
  if (chunk !== null) {
    const mod = await import(chunk) as { hydrate?: () => void };
    mod.hydrate?.();
  }
}

/** Mounts a resolved Vue component into its container. */
export type IslandMounter = (
  component: Component,
  props: Record<string, unknown>,
  el: Element,
) => void;

/** Dynamically imports a Vue island chunk by URL. */
export type ChunkImporter = (url: string) => Promise<{ default: Component }>;

/**
 * Find every Vue island placeholder in `doc`, resolve its chunk from `manifest`
 * (island name → chunk URL), import it, and mount the component with the props
 * the server serialised. Injectable `mount` / `importer` make it testable
 * without a real bundle or browser.
 */
export function bootVueIslands(
  doc: Document,
  manifest: Record<string, string>,
  mount: IslandMounter = mountVueIsland,
  importer: ChunkImporter = (url) => import(url),
): Promise<void> {
  const jobs: Promise<void>[] = [];
  doc.querySelectorAll(`[${VUE_ISLAND_ATTR}]`).forEach((el) => {
    const name = el.getAttribute(VUE_ISLAND_ATTR);
    if (name === null) return;
    const chunk = manifest[name];
    if (chunk === undefined) {
      // deno-lint-ignore no-console
      console.warn(`No Vue island chunk registered for "${name}".`);
      return;
    }
    let props: Record<string, unknown> = {};
    const raw = el.getAttribute(VUE_ISLAND_PROPS_ATTR);
    if (raw !== null && raw !== "") {
      try {
        props = JSON.parse(raw);
      } catch {
        // deno-lint-ignore no-console
        console.warn(`Malformed props for Vue island "${name}".`);
      }
    }
    jobs.push(importer(chunk).then((mod) => mount(mod.default, props, el)));
  });
  return Promise.all(jobs).then(() => undefined);
}

if (typeof document !== "undefined") {
  const run = () => bootVueIslands(document, globalThis.__HOWL_VUE__ ?? {});
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  // Tag the initial history entry so a Back navigation to it triggers a client
  // swap (popstate only acts on entries we marked).
  if (
    document.body !== null && clientNavEnabled(document.body) &&
    !(history.state as { howlVue?: boolean } | null)?.howlVue
  ) {
    history.replaceState({ howlVue: true }, "", location.href);
  }

  // Client-nav: intercept same-origin link clicks inside a `client-nav`
  // boundary and swap the page region instead of reloading.
  document.addEventListener("click", (e) => {
    if (
      e.defaultPrevented || e.button !== 0 ||
      e.ctrlKey || e.metaKey || e.altKey || e.shiftKey
    ) return;
    const a = eligibleAnchor(e.target);
    if (a === null) return;
    e.preventDefault();
    if (a.href !== location.href) navigateVuePage(new URL(a.href), true);
  });

  addEventListener("popstate", (e) => {
    if ((e.state as { howlVue?: boolean } | null)?.howlVue) {
      navigateVuePage(new URL(location.href), false);
    }
  });

  // Prefetch on intent: warm the destination's SSR HTML on hover / touch /
  // keyboard focus so the click swap is instant. Opt in with a `client-prefetch`
  // boundary; opt a link/subtree out with `client-prefetch="false"`.
  const warm = (target: EventTarget | null) => {
    const a = eligibleAnchor(target);
    if (a !== null && prefetchEnabled(a)) prefetchPage(a.href);
  };
  document.addEventListener("mouseover", (e) => {
    const a = eligibleAnchor(e.target);
    if (a === null || a === intentLink || !prefetchEnabled(a)) return;
    clearTimeout(intentTimer);
    intentLink = a;
    intentTimer = setTimeout(() => {
      if (intentLink !== null) prefetchPage(intentLink.href);
    }, HOVER_INTENT_MS);
  }, { passive: true });
  document.addEventListener("mouseout", (e) => {
    const related = (e as MouseEvent).relatedTarget as Node | null;
    if (intentLink !== null && related !== null && intentLink.contains(related)) {
      return;
    }
    clearTimeout(intentTimer);
    intentLink = null;
  }, { passive: true });
  document.addEventListener("focusin", (e) => warm(e.target), { passive: true });
  document.addEventListener(
    "touchstart",
    (e) => warm(e.target),
    { capture: true, passive: true },
  );
}
