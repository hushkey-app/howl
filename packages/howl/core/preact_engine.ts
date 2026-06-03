import type { Context } from "./context.ts";
import type { RenderEngine } from "./engine.ts";
import { type ComponentDef, renderRouteComponent } from "./render.ts";

type AnyComponentDef = ComponentDef<unknown, unknown>;

/**
 * Howl's built-in render engine: Preact. Renders the matched route's
 * (already-imported) page component through the layout/app stack via
 * `ctx.render` — the path Howl has always used, now behind the pluggable
 * {@linkcode RenderEngine} seam so Preact is **selected explicitly** like any
 * other engine rather than being an implicit default. Usually imported from
 * `@hushkey/howl-preact` (which re-exports it) for symmetry with the Vue/React
 * engine packages:
 *
 * ```ts
 * import { Howl } from "@hushkey/howl";
 * import { preactEngine } from "@hushkey/howl-preact";
 * const app = new Howl({ engines: { preact: preactEngine() } });
 * ```
 *
 * Unlike the Vue/React engines it renders {@linkcode RenderEngineRenderOptions.component}
 * (the pre-imported component) rather than loading from a source file, so it
 * works unchanged in a `deno compile` binary.
 */
export function preactEngine(): RenderEngine<Context<unknown>> {
  return {
    async render(ctx, opts) {
      let vnode = null;
      if (opts.component !== undefined) {
        const def: AnyComponentDef = {
          component: opts.component as AnyComponentDef["component"],
          // `renderRouteComponent` reads `props` as the handler data and builds
          // the full `PageProps` itself, so passing the raw data is correct.
          props: opts.data as AnyComponentDef["props"],
        };
        const result = await renderRouteComponent(ctx, def, () => null);
        if (result instanceof Response) return result;
        vnode = result;
      }
      return await ctx.render(vnode, { headers: opts.headers, status: opts.status });
    },
  };
}
