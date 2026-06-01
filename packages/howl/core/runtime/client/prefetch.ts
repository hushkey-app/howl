import { isClientNavOptedIn } from "../shared_internal.ts";
import { prefetchPartial } from "./partials.ts";
import { prefetchAotRoute } from "./aot.ts";

/**
 * Link-prefetch on intent. When the pointer hovers (or a touch/focus signals
 * intent on) an `f-client-nav` link, the destination is warmed ahead of the
 * click: AOT routes pre-import their JS chunk, SSR routes pre-fetch their
 * partial response. The subsequent navigation then reuses the warmed result,
 * making it feel instant — the same idea as Hotwired Turbo / instant.page.
 *
 * Engine-agnostic: it only touches URLs, `fetch`, and dynamic `import()`, so
 * any future render engine that reuses Howl's navigation layer gets it for free.
 *
 * Opt out per-link (or per-subtree) with `f-prefetch="false"`.
 */

/** Attribute used to opt a link or subtree out of prefetching. */
const PREFETCH_ATTR = "f-prefetch";

/** Hover dwell (ms) before a pointer hover is treated as navigation intent. */
const HOVER_INTENT_MS = 65;

let intentTimer: ReturnType<typeof setTimeout> | undefined;
let intentLink: HTMLAnchorElement | null = null;

/** Respect the user's data-saver preference — never prefetch speculatively. */
function saveDataEnabled(): boolean {
  // deno-lint-ignore no-explicit-any
  const conn = (navigator as any).connection;
  if (conn && conn.saveData === true) return true;
  return globalThis.matchMedia?.("(prefers-reduced-data: reduce)").matches ?? false;
}

/** Resolve an event target to a prefetch-eligible anchor, or `null`. */
function eligibleLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const a = target.nodeName === "A" ? target as HTMLAnchorElement : target.closest("a");
  if (!(a instanceof HTMLAnchorElement) || !a.href) return null;
  if (a.origin !== location.origin) return null;
  if (a.target && a.target !== "_self") return null;
  const rawHref = a.getAttribute("href");
  if (rawHref === null || rawHref.startsWith("#")) return null;
  if (!isClientNavOptedIn(a)) return null;
  const optOut = a.closest(`[${PREFETCH_ATTR}]`);
  if (optOut !== null && optOut.getAttribute(PREFETCH_ATTR) === "false") {
    return null;
  }
  return a;
}

/** Warm whichever navigation path the destination uses. */
function warm(a: HTMLAnchorElement): void {
  const url = new URL(a.href);
  if (url.href === location.href) return;
  // AOT first (warms the JS chunk); fall back to SSR-partial prefetch.
  if (!prefetchAotRoute(url)) {
    prefetchPartial(url);
  }
}

function onOver(e: Event): void {
  if (saveDataEnabled()) return;
  const a = eligibleLink(e.target);
  if (a === null || a === intentLink) return;
  clearTimeout(intentTimer);
  intentLink = a;
  intentTimer = setTimeout(() => {
    if (intentLink !== null) warm(intentLink);
  }, HOVER_INTENT_MS);
}

function onOut(e: Event): void {
  // Only cancel when the pointer truly leaves the tracked link's subtree —
  // mouseout fires for every child element traversal otherwise.
  const related = (e as MouseEvent).relatedTarget as Node | null;
  if (intentLink !== null && related !== null && intentLink.contains(related)) {
    return;
  }
  clearTimeout(intentTimer);
  intentLink = null;
}

/** Touch + keyboard focus signal intent immediately — no dwell delay. */
function onImmediate(e: Event): void {
  if (saveDataEnabled()) return;
  const a = eligibleLink(e.target);
  if (a !== null) warm(a);
}

if (typeof document !== "undefined") {
  // Delegated, passive listeners on the document — negligible overhead and
  // never call preventDefault, so they can't interfere with clicks.
  document.addEventListener("mouseover", onOver, { passive: true });
  document.addEventListener("mouseout", onOut, { passive: true });
  document.addEventListener("focusin", onImmediate, { passive: true });
  document.addEventListener("touchstart", onImmediate, {
    capture: true,
    passive: true,
  });
}
