/// <reference lib="dom" />
import { type App, computed, type ComputedRef } from "vue";
import { type HowlRoute, navigate } from "./router.ts";

declare global {
  /** Dev-only route map emitted by the Vue engine: every route + its mode. */
  var __HOWL_ROUTES__: Array<{ pattern: string; mode: string; engine: string }> | undefined;
}

/** One entry of the dev route map emitted as `window.__HOWL_ROUTES__`. */
export interface HowlRouteEntry {
  /** Route pattern, trailing slash already stripped (e.g. `/users/:id`). */
  pattern: string;
  /** How the route is served. */
  mode: string;
  /** Render engine that owns it (`"vue"`). */
  engine: string;
}

/** Read the live route map emitted into the page (empty before first paint). */
export function routeMap(): HowlRouteEntry[] {
  return globalThis.__HOWL_ROUTES__ ?? [];
}

/** Drop a trailing slash (except root `/`) so `ctx.route` matches manifest patterns. */
export function normPattern(pattern: string | null): string | null {
  if (pattern === null) return null;
  return pattern !== "/" && pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
}

/** A `vue-router`-shaped route record — the shape Vue DevTools reads for its
 * built-in Routes tab. Only the display/navigation fields are populated. */
interface RouteRecordShim {
  path: string;
  name: string;
  meta: Record<string, unknown>;
  props: Record<string, unknown>;
  children: RouteRecordShim[];
  components: Record<string, unknown>;
  redirect: undefined;
  aliasOf: undefined;
}

/** Map the dev route manifest to `vue-router`-style records for DevTools. */
function routeRecords(): RouteRecordShim[] {
  return routeMap().map((r) => ({
    path: r.pattern,
    name: r.pattern,
    meta: { mode: r.mode, engine: r.engine },
    props: {},
    children: [],
    components: {},
    redirect: undefined,
    aliasOf: undefined,
  }));
}

/** Resolve a navigation target (string or `{ path }`) to an href string. */
function locationToHref(to: unknown): string {
  if (typeof to === "string") return to;
  if (to !== null && typeof to === "object") {
    const o = to as { path?: string; fullPath?: string; name?: string };
    return o.fullPath ?? o.path ?? o.name ?? "/";
  }
  return "/";
}

/** Build the reactive `currentRoute` ref DevTools reads (`router.currentRoute.value`). */
function makeCurrentRoute(current: () => HowlRoute): ComputedRef<Record<string, unknown>> {
  return computed(() => {
    const r = current();
    const matched = routeRecords().filter((rec) => rec.path === normPattern(r.route));
    return {
      fullPath: r.href || r.path || "/",
      path: r.path || "/",
      name: r.route,
      params: r.params,
      query: r.query,
      hash: r.hash,
      meta: matched[0]?.meta ?? {},
      matched,
      redirectedFrom: undefined,
    };
  });
}

/**
 * Install a minimal `vue-router`-shaped object on `app.config.globalProperties`
 * so Vue DevTools' **built-in Routes tab** detects and populates from it: it
 * reads `$router.getRoutes()` / `$router.currentRoute.value` and navigates via
 * `$router.push`. This is *not* vue-router — just the surface DevTools inspects,
 * fed by Howl's route map + reactive route.
 *
 * **Must be called before `app.mount()`** — DevTools reads `$router` on the
 * `app:init` hook that mounting fires, the same point `vue-router`'s `install()`
 * sets it. Dev-only; the boot runtime calls it when the route map is present.
 */
export function installRouterShim(app: App, current: () => HowlRoute): void {
  const currentRoute = makeCurrentRoute(current);

  const resolve = (to: unknown) => {
    const href = locationToHref(to);
    const path = href.split("?")[0].split("#")[0];
    const matched = routeRecords().filter((rec) => rec.path === normPattern(path));
    return {
      fullPath: href,
      path,
      name: matched[0]?.name,
      params: {},
      query: {},
      hash: "",
      matched,
      meta: matched[0]?.meta ?? {},
      redirectedFrom: undefined,
    };
  };

  const noopUnregister = () => () => {};
  const router = {
    currentRoute,
    options: { routes: routeRecords(), history: { base: "" } },
    getRoutes: () => routeRecords(),
    hasRoute: (name: string) => routeRecords().some((r) => r.name === name),
    resolve,
    push: (to: unknown) => navigate(locationToHref(to)),
    replace: (to: unknown) => navigate(locationToHref(to), { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    go: (n: number) => navigate(n),
    beforeEach: noopUnregister,
    beforeResolve: noopUnregister,
    afterEach: noopUnregister,
    onError: noopUnregister,
    isReady: () => Promise.resolve(),
    install: () => {},
  };

  const props = app.config.globalProperties as Record<string, unknown>;
  props.$router = router;
  Object.defineProperty(props, "$route", {
    configurable: true,
    get: () => currentRoute.value,
  });
}
