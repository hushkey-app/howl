/**
 * Options passed to a {@linkcode RenderEngine} when it renders a route.
 */
export interface RenderEngineRenderOptions {
  /** Absolute path of the page's source file (e.g. a `.tsx` or `.vue` file). */
  filePath: string;
  /** Data returned by the route's handler, used as page props. */
  data?: unknown;
  /** Response headers accumulated by middleware / the handler so far. */
  headers: Headers;
  /** HTTP status code resolved so far. */
  status: number;
  /** Client hydration chunk URL for this route, if the build produced one. */
  chunkUrl?: string;
  /**
   * AOT manifest: route pattern → client chunk URL, for routes the engine can
   * render client-side on navigation. Emitted into the page so the client
   * runtime can intercept nav to these routes. Empty/undefined when none.
   */
  aot?: Record<string, string>;
  /**
   * Precompiled SSR module for this route, when the build produced one (prod).
   * Lets the engine render an already-compiled page instead of compiling the
   * source at request time — required for `deno compile` binaries, where the
   * source file isn't on disk. Loosely typed; the engine narrows it.
   */
  module?: unknown;
  /** Whether the server is running in development mode (enables live-reload). */
  dev?: boolean;
}

/**
 * A pluggable rendering engine. Howl's core renders nothing — it is routing,
 * middleware, context, and this seam. An engine turns a matched route into the
 * HTTP response, so the view layer is a package you pick (e.g. React via
 * `@hushkey/howl-react`, Vue via `@hushkey/howl-vue`) or write yourself.
 *
 * Register engines on the {@linkcode Howl} constructor's `engines` option,
 * keyed by name; a route opts in by carrying a matching `engine` tag (set by
 * the file-system crawler from the file extension, e.g. `.vue` → `"vue"`).
 * With no engine registered, a route that returns data falls back to
 * `ctx.json()`.
 *
 * `Ctx` is loosely typed as `unknown` in core to avoid a config↔context import
 * cycle; implementations narrow it to `Context<State>`.
 */
export interface RenderEngine<Ctx = unknown> {
  /**
   * Render the matched route to a full HTTP `Response`. The engine owns the
   * entire document — it does not flow through any built-in app/layout stack.
   */
  render(
    ctx: Ctx,
    opts: RenderEngineRenderOptions,
  ): Promise<Response> | Response;

  /**
   * Render a standalone component to an HTML string in this engine's template
   * language — for templates rendered **outside** the page/layout/request flow
   * (emails, notifications, partial fragments). Surfaced on the request context
   * as `ctx.renderToString(component, props?)`. No layouts, no app shell, no
   * headers — just the component to markup.
   *
   * Optional: an engine that doesn't implement it can't back `ctx.renderToString`.
   */
  renderToString?(
    component: unknown,
    props?: Record<string, unknown>,
  ): Promise<string> | string;
}
