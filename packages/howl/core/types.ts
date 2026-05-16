import type { RouteHandler } from "./handlers.ts";
import type { Method } from "./router.ts";
import type { RouteComponent } from "./segments.ts";

/**
 * Per-route configuration controlling rendering behaviour.
 */
export interface RouteConfig {
  /** Override the auto-derived route pattern (FS-based) with an explicit one. */
  routeOverride?: string;
  /** Whether to attach a Content-Security-Policy nonce for this route. */
  csp?: boolean;
  /** Skip the layout chain inherited from parent segments when rendering. */
  skipInheritedLayouts?: boolean;
  /** Skip the outer app wrapper component when rendering. */
  skipAppWrapper?: boolean;
  /** Restrict the route to specific HTTP methods. `"ALL"` accepts any method. */
  methods?: "ALL" | Method[];
}

/**
 * Primitive value accepted for a dynamic segment in
 * {@linkcode GetStaticPaths}.
 */
export type StaticPathParam = string | number | boolean;

/**
 * Param tuple for a dynamic route pattern. Keys map to route param names
 * (e.g. `{ id: "abc" }` for `/properties/:id`).
 */
export type StaticPathParams = Record<string, StaticPathParam>;

/**
 * Build-time dynamic-param enumerator for SSG routes.
 *
 * Export this from an `___` page file to tell the builder which concrete URLs
 * should be prerendered.
 */
export type GetStaticPaths =
  | (() => StaticPathParams[])
  | (() => Promise<StaticPathParams[]>);

/**
 * Per-layout configuration that mirrors the layout-relevant subset of
 * {@linkcode RouteConfig}.
 */
export interface LayoutConfig {
  /** Skip layouts inherited from parent segments. */
  skipInheritedLayouts?: boolean;
  /** Skip the outer app wrapper component. */
  skipAppWrapper?: boolean;
}

/**
 * Definition of a file-system route — its component, handler, config and
 * island CSS dependencies.
 */
export interface Route<State> {
  /** Route component rendered for matching requests. */
  component?: RouteComponent<State>;
  /** Optional route configuration. */
  config?: RouteConfig;
  /** Custom request handler that bypasses or augments component rendering. */
  handler?: RouteHandler<unknown, State>;
  /** CSS asset URLs to preload alongside the route. */
  css?: string[];
}

/** A lazy-loaded value — typically used for code-split routes/middleware. */
export type Lazy<T> = () => Promise<T>;
/** A value that is either eager or wrapped in a {@linkcode Lazy} loader. */
export type MaybeLazy<T> = T | Lazy<T>;
