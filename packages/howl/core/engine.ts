/**
 * Options passed to a {@linkcode RenderEngine} when it renders a route.
 */
export interface RenderEngineRenderOptions {
  /** Absolute path of the page's source file (e.g. a `.vue` file). */
  filePath: string;
  /** Data returned by the route's handler, used as page props. */
  data?: unknown;
  /** Response headers accumulated by middleware / the handler so far. */
  headers: Headers;
  /** HTTP status code resolved so far. */
  status: number;
  /** Client hydration chunk URL for this route, if the build produced one. */
  chunkUrl?: string;
  /** CSS bundle URL for this route, if the page (or its wrappers) have styles. */
  cssUrl?: string;
}

/**
 * A pluggable rendering engine. Howl's built-in page rendering is Preact; an
 * engine lets a route be rendered by a different framework (e.g. Vue via
 * `@hushkey/howl-vue`) while reusing Howl's routing, middleware, and context.
 *
 * Register engines on the {@linkcode Howl} constructor's `engines` option,
 * keyed by name; a route opts in by carrying a matching `engine` tag (set by
 * the file-system crawler from the file extension, e.g. `.vue` → `"vue"`).
 *
 * `Ctx` is loosely typed as `unknown` in core to avoid a config↔context import
 * cycle; implementations narrow it to `Context<State>`.
 */
export interface RenderEngine<Ctx = unknown> {
  /**
   * Render the matched route to a full HTTP `Response`. The engine owns the
   * entire document (it does not flow through `ctx.render` or the Preact
   * app/layout stack).
   */
  render(
    ctx: Ctx,
    opts: RenderEngineRenderOptions,
  ): Promise<Response> | Response;
}
