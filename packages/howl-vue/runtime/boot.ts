/// <reference lib="dom" />
import {
  type App,
  type Component,
  createSSRApp,
  type ShallowRef,
  shallowRef,
  type VNode,
} from "vue";
import { createHead } from "@unhead/vue/client";
import { createPinia, type Pinia } from "pinia";
import { composeVueTree } from "./compose.ts";
import {
  createRoute,
  type HowlRoute,
  type NavigateOptions,
  provideRoute,
  registerNavigator,
  setRoute,
} from "./router.ts";
import { installRouterShim } from "./router_shim.ts";

// One head instance for the session — unhead keeps `document.head` in sync as
// pages mount/unmount across client-nav, so per-page title/meta update on nav.
const head = createHead();

declare global {
  var __VUE_PAGE_PROPS__: Record<string, unknown> | undefined;
  // deno-lint-ignore no-explicit-any
  var __PINIA__: Record<string, any> | undefined;
  /** AOT routes: route pattern (`/about/:id`) → client chunk URL. */
  var __HOWL_VUE_AOT__: Record<string, string> | undefined;
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
// Mirrors `@hushkey/howl`'s PARTIAL_SEARCH_PARAM. Appended to client-nav fetches
// so the server marks the request `ctx.isPartial` — the page can tell a
// client-nav apart from a fresh load. Hardcoded (not imported) to keep Howl core
// out of the client bundle. The engine strips it back off the page's `url` prop.
const PARTIAL_PARAM = "howl-partial";

/**
 * The URL to actually fetch for a client-nav: the destination plus the partial
 * marker. The prefetch cache and history entry stay keyed on the clean `href`.
 */
function partialFetchUrl(href: string): string {
  const u = new URL(href, location.origin);
  u.searchParams.set(PARTIAL_PARAM, "true");
  return u.href;
}

let currentApp: App | null = null;
// The mounted app's root renders this reactive page tree; client-nav swaps it.
let pageTree: ShallowRef<(() => VNode) | null> | null = null;
// The session's reactive route — provided on the app, updated on every nav so
// `useRoute()` consumers re-render.
let route: HowlRoute | null = null;
let intentTimer: ReturnType<typeof setTimeout> | undefined;
let intentLink: HTMLAnchorElement | null = null;
const prefetchCache = new Map<string, { job: Promise<string>; ts: number }>();

/**
 * Revive non-JSON values in the serialized page props so the client tree sees
 * the same shape the server did — notably `url`, which `JSON.stringify` flattens
 * to its href string (`URL.toJSON`) and we turn back into a real `URL`.
 */
function reviveProps(raw: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw.url === "string") {
    try {
      return { ...raw, url: new URL(raw.url) };
    } catch {
      // leave the string as-is if it isn't a valid absolute URL
    }
  }
  return raw;
}

/**
 * Render the Vue page tree into `#howl-app`. `components` is the
 * `[…Layouts, Page]` chain (the `_app.vue` shell stays static, outside it).
 *
 * One app lives for the whole session: the first call **hydrates** the
 * server-rendered markup; later calls (client-nav) swap a reactive page tree on
 * that same app so Vue **re-renders** (a normal patch, not re-hydration). That
 * keeps Pinia / unhead installed once (re-installing per nav breaks Vue
 * devtools), lets persisted stores stay authoritative (no hydration mismatch),
 * and reuses unchanged layouts (their `onMounted` doesn't re-fire each nav).
 */
export function hydrateVuePage(components: Component[]): void {
  const el = document.getElementById(HOWL_APP_ID);
  if (el === null) return;
  const props = reviveProps(globalThis.__VUE_PAGE_PROPS__ ?? {});
  const render = composeVueTree(components, props);

  if (currentApp !== null && pageTree !== null) {
    pageTree.value = render; // client-nav: re-render on the existing app
    if (route !== null) setRoute(route, props);
    return;
  }

  pageTree = shallowRef(render);
  route = createRoute(props);
  currentApp = createSSRApp({ render: () => pageTree!.value!() });
  currentApp.use(head);
  provideRoute(currentApp, route);
  if (document.body.hasAttribute("pinia")) currentApp.use(getPinia());
  // Install the `$router` shim BEFORE mount (dev only): Vue DevTools reads
  // `app.config.globalProperties.$router` on the `app:init` hook that mounting
  // fires — set it after mount and the built-in Routes tab stays empty.
  if ((globalThis as { __HOWL_ROUTES__?: unknown }).__HOWL_ROUTES__ !== undefined) {
    installRouterShim(currentApp, () => route!);
  }
  currentApp.mount(el);
}

/** Replace the inlined page CSS with `styles`. AOT routes are client-rendered
 * (no SSR HTML to swap styles from), so the chunk carries + injects its own. */
function injectPageStyles(styles: string[]): void {
  let el = document.head.querySelector("style[data-howl-vue-css]");
  if (el === null) {
    el = document.createElement("style");
    el.setAttribute("data-howl-vue-css", "");
    document.head.appendChild(el);
  }
  el.textContent = styles.join("\n");
}

/**
 * Render an AOT route on the client: inject its scoped CSS and re-render the
 * persistent app's page tree with client-derived `props` — **no server fetch**.
 * Called by an AOT page chunk's exported `aotMount(props)`.
 */
export function aotMountVuePage(
  components: Component[],
  styles: string[],
  props: Record<string, unknown>,
): void {
  injectPageStyles(styles);
  globalThis.__VUE_PAGE_PROPS__ = props;
  hydrateVuePage(components);
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
  const job = fetch(partialFetchUrl(href), {
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

/** Add a `<link rel="modulepreload">` for `url` (once) so a later `import()` is a
 * cache hit. */
function modulePreload(url: string): void {
  if (document.head.querySelector(`link[rel="modulepreload"][href="${url}"]`) !== null) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = url;
  document.head.appendChild(link);
}

/** Modulepreload a prefetched page's hydration chunk (+ its Vue deps) so the
 * eventual nav `import()` is a cache hit. */
function preloadPageChunk(html: string): void {
  const m = html.match(/data-chunk="([^"]+)"/);
  if (m !== null) modulePreload(m[1]);
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
 * Client-side navigation for Vue pages: fetch the destination's SSR HTML for its
 * props/styles/chunk, then re-render the persistent app's page tree in place —
 * no full reload, so anything outside `#howl-app` (the `_app.vue` shell, module
 * singletons like a store) stays alive. The page chunk is imported *before* any
 * DOM change so the style swap and re-render happen in one tick (no flicker).
 * Falls back to a full browser navigation for non-HTML responses or pages
 * without a `#howl-app` target.
 */
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
  const entry = { howlVue: true, navState: intent.state };
  if (intent.history === "push") history.pushState(entry, "", href);
  else if (intent.history === "replace") history.replaceState(entry, "", href);
}

async function navigateVuePage(url: URL, intent: NavIntent): Promise<void> {
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

  // Import the page chunk BEFORE touching the live DOM. The `await` is the only
  // async gap; doing it first means the style swap and the re-render below happen
  // in the *same* tick. Otherwise there's a frame where the old page is still on
  // screen under the new page's scoped CSS (mismatched `data-v`) → it loses its
  // styles → flicker. A cache hit when the chunk was preloaded on hover.
  const chunk = pageScript.getAttribute("data-chunk");
  const mod = chunk !== null ? await import(chunk) as { hydrate?: () => void } : null;

  // From here down there is no `await`: apply props, state, styles, title and
  // history, then re-render — all synchronously, so the page swaps atomically.
  // The persistent app owns `#howl-app` and re-renders from the new props + chunk;
  // no manual markup swap (that would corrupt Vue's vdom).
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

  // Push the URL the server actually rendered (`nextProps.url`), so a redirect
  // during the nav (e.g. `/about` → `/about/1999`) lands the address bar on the
  // final URL, not the clicked one. Falls back to the requested URL.
  const landed = typeof nextProps.url === "string" ? nextProps.url : url.href;
  applyHistory(intent, landed);
  if (intent.scroll) scrollTo({ top: 0, left: 0, behavior: "instant" });

  // Stable chunk URL (no cache-bust) so the preload applies and revisits reuse
  // the loaded module. Re-renders the page tree into `#howl-app` (see boot).
  mod?.hydrate?.();
}

// --- AOT navigation: client-render a `__`-prefixed route, no server round-trip ---

interface AotRoute {
  pattern: string;
  chunk: string;
  re: RegExp;
  keys: string[];
}
let aotRoutes: AotRoute[] | null = null;

/** Compile the `__HOWL_VUE_AOT__` manifest (route pattern → chunk) into matchers
 * (a `:param` → capture-group regex; complex patterns just won't match → SSR
 * nav). */
function getAotRoutes(): AotRoute[] {
  if (aotRoutes === null) {
    aotRoutes = Object.entries(globalThis.__HOWL_VUE_AOT__ ?? {}).map(
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

/** State for an AOT render — the persisted Pinia `state` store (mirrors the last
 * server `ctx.state`) or the last page's `state` prop when Pinia is off. */
function currentState(): unknown {
  if (document.body.hasAttribute("pinia")) {
    const s = getPinia().state.value.state;
    if (s !== undefined) return s;
  }
  return (globalThis.__VUE_PAGE_PROPS__ as { state?: unknown } | undefined)?.state;
}

/**
 * Navigate to an AOT route by client-rendering its chunk with props derived on
 * the client (URL, route params, persisted state) — no SSR-HTML fetch. `data` is
 * left undefined (a per-route data loader is a future addition).
 */
async function aotNavigate(
  url: URL,
  intent: NavIntent,
  match: { route: AotRoute; params: Record<string, string> },
): Promise<void> {
  const props: Record<string, unknown> = {
    Component: undefined,
    url,
    params: match.params,
    query: Object.fromEntries(url.searchParams),
    route: match.route.pattern,
    isPartial: true,
    state: currentState(),
    data: undefined,
    error: null,
  };
  // Import the chunk before touching the DOM so style-inject + render are atomic.
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
  else void navigateVuePage(url, intent);
}

if (typeof document !== "undefined") {
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
    if (a.href !== location.href) {
      navigateTo(new URL(a.href), { history: "push", scroll: true });
    }
  });

  addEventListener("popstate", (e) => {
    if ((e.state as { howlVue?: boolean } | null)?.howlVue) {
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
