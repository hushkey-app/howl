import { type AnyComponent, Fragment, h, isValidElement, type VNode } from "preact";
import { jsxTemplate } from "preact/jsx-runtime";
import { renderToString } from "preact-render-to-string";
import { SpanStatusCode } from "@opentelemetry/api";
import type { Context } from "./context.ts";
import type { BuildCache } from "./build_cache.ts";
import type { LayoutConfig } from "./types.ts";
import type { RenderEngine } from "./engine.ts";
import { HowlScripts, RenderState, setRenderState } from "./runtime/server/preact_hooks.ts";
import { DEV_ERROR_OVERLAY_URL, PARTIAL_SEARCH_PARAM } from "./constants.ts";
import { tracer } from "./otel.ts";
import {
  type ComponentDef,
  isAsyncAnyComponent,
  type PageProps,
  renderAsyncAnyComponent,
  renderRouteComponent,
} from "./render.ts";

type AnyComponentDef = ComponentDef<unknown, unknown>;

/**
 * The framework-internal layout/app tree + render state a `Context` hands to the
 * Preact engine's {@linkcode renderPreactPage}. Loosely surfaced as `unknown`
 * on `RenderEngine.renderInline`; the engine narrows it back to this shape.
 */
export interface PreactRenderInternals {
  /** The `_app` wrapper component, or `null`. */
  app: AnyComponent<PageProps<unknown, unknown>> | null;
  /** The `_layout` chain, root → leaf. */
  layouts: ComponentDef<unknown, unknown>[];
  /** The request's build cache. */
  buildCache: BuildCache<unknown>;
  /** Extra island CSS asset URLs to preload, if any. */
  additionalStyles: string[] | null;
}

/** Local copy of `Context`'s header helper (kept off the public `Context` API). */
function getHeadersFromInit(init?: ResponseInit): Headers {
  if (init === undefined) return new Headers();
  return init.headers !== undefined
    ? init.headers instanceof Headers ? init.headers : new Headers(init.headers)
    : new Headers();
}

/**
 * Render a vnode through the layout/app stack to a full page `Response` — the
 * implementation behind `ctx.render(<jsx>)`. Lifted out of `Context` so the
 * Preact render machinery lives with the engine rather than in core; `Context`
 * passes its internal layout/app tree as {@linkcode PreactRenderInternals}.
 */
export async function renderPreactPage(
  ctx: Context<unknown>,
  // deno-lint-ignore no-explicit-any
  vnode: VNode<any> | null,
  init: ResponseInit,
  config: LayoutConfig,
  internals: PreactRenderInternals,
): Promise<Response> {
  if (vnode !== null && !isValidElement(vnode)) {
    throw new Error(`Non-JSX element passed to: ctx.render()`);
  }

  const defs = config.skipInheritedLayouts ? [] : internals.layouts;
  const appDef = config.skipAppWrapper ? null : internals.app;
  const props = ctx;

  // Compose final vnode tree (leaf → root layouts).
  for (let i = defs.length - 1; i >= 0; i--) {
    const child = vnode;
    props.Component = () => child;
    const result = await renderRouteComponent(ctx, defs[i], () => child);
    if (result instanceof Response) return result;
    vnode = result;
  }

  const appChild = vnode;
  // deno-lint-ignore no-explicit-any
  let appVNode: VNode<any>;
  let hasApp = true;

  if (isAsyncAnyComponent(appDef)) {
    props.Component = () => appChild;
    const result = await renderAsyncAnyComponent(appDef, props);
    if (result instanceof Response) return result;
    appVNode = result;
  } else if (appDef !== null) {
    appVNode = h(appDef, {
      Component: () => appChild,
      config: ctx.config,
      data: null,
      error: ctx.error,
      info: ctx.info,
      isPartial: ctx.isPartial,
      params: ctx.params,
      req: ctx.req,
      state: ctx.state,
      url: ctx.url,
      route: ctx.route,
    });
  } else {
    hasApp = false;
    appVNode = appChild ?? h(Fragment, null);
  }

  const headers = getHeadersFromInit(init);
  headers.set("Content-Type", "text/html; charset=utf-8");

  // Merge ctx.headers (cookies + middleware-set headers) into the response.
  ctx.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") headers.append(key, value);
    else headers.set(key, value);
  });

  const responseInit: ResponseInit = {
    status: init.status ?? 200,
    headers,
    statusText: init.statusText,
  };

  let partialId = "";
  if (ctx.url.searchParams.has(PARTIAL_SEARCH_PARAM)) {
    partialId = crypto.randomUUID();
    headers.set("X-Howl-Id", partialId);
  }

  const html = tracer.startActiveSpan("render", (span) => {
    span.setAttribute("howl.span_type", "render");
    const state = new RenderState(ctx, internals.buildCache, partialId);

    if (internals.additionalStyles !== null) {
      for (let i = 0; i < internals.additionalStyles.length; i++) {
        state.islandAssets.add(internals.additionalStyles[i]);
      }
    }

    try {
      setRenderState(state);

      // Two-pass render: the first pass collects <Head> children encountered in
      // <body>; the second emits them via <RemainingHead> when <head> is
      // processed (head runs before body, so one pass collects them too late).
      const rootVNode = hasApp ? appVNode : (vnode ?? h(Fragment, null));
      renderToString(rootVNode);
      state.resetForSecondPass();
      if (internals.additionalStyles !== null) {
        for (let i = 0; i < internals.additionalStyles.length; i++) {
          state.islandAssets.add(internals.additionalStyles[i]);
        }
      }
      let html = renderToString(rootVNode);

      if (
        !state.renderedHtmlBody || !state.renderedHtmlHead || !state.renderedHtmlTag
      ) {
        let fallback: VNode = jsxTemplate([html]);
        if (!state.renderedHtmlBody) {
          let scripts: VNode | null = null;
          if (ctx.url.pathname !== ctx.config.basePath + DEV_ERROR_OVERLAY_URL) {
            scripts = h(HowlScripts, null) as VNode;
          }
          fallback = h("body", null, fallback, scripts);
        }
        if (!state.renderedHtmlHead) {
          fallback = h(
            Fragment,
            null,
            h("head", null, h("meta", { charset: "utf-8" })),
            fallback,
          );
        }
        if (!state.renderedHtmlTag) {
          fallback = h("html", null, fallback);
        }
        html = renderToString(fallback);
      }

      return `<!DOCTYPE html>${html}`;
    } catch (err) {
      if (err instanceof Error) span.recordException(err);
      else span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      // Zero-JS default: nothing on the page needs the client runtime (no
      // island, no <Partial>, no client-nav) → skip the modulepreload Link
      // header. Pages with only CSS still preload styles below.
      const basePath = ctx.config.basePath;
      const linkParts: string[] = [];
      if (state.needsClientRuntime) {
        const runtimeUrl = state.buildCache.clientEntry.startsWith(".")
          ? state.buildCache.clientEntry.slice(1)
          : state.buildCache.clientEntry;
        linkParts.push(
          `<${encodeURI(`${basePath}${runtimeUrl}`)}>; rel="modulepreload"; as="script"`,
        );
        state.islands.forEach((island) => {
          const specifier = `${basePath}${
            island.file.startsWith(".") ? island.file.slice(1) : island.file
          }`;
          linkParts.push(`<${encodeURI(specifier)}>; rel="modulepreload"; as="script"`);
        });
      }
      state.islandAssets.forEach((css) => {
        linkParts.push(`<${encodeURI(css)}>; rel="preload"; as="style"`);
      });
      if (linkParts.length > 0) headers.append("Link", linkParts.join(", "));

      state.clear();
      setRenderState(null);
      span.end();
    }
  });

  return new Response(html, responseInit);
}

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
    renderToString(component, props) {
      return renderToString(h(component as AnyComponent, props ?? null));
    },
    renderInline(ctx, vnode, init, config, internals) {
      return renderPreactPage(
        ctx,
        vnode as VNode | null,
        init ?? {},
        config as LayoutConfig,
        internals as PreactRenderInternals,
      );
    },
  };
}
