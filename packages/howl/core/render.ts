import {
  type AnyComponent,
  type FunctionComponent,
  h,
  type RenderableProps,
  type VNode,
} from "preact";
import type { Context } from "./context.ts";
import { recordSpanError, tracer } from "./otel.ts";

export type AsyncAnyComponent<P> = {
  (
    props: RenderableProps<P>,
    // deno-lint-ignore no-explicit-any
    context?: any,
    // deno-lint-ignore no-explicit-any
  ): Promise<VNode<any> | Response | null>;
  displayName?: string;
  defaultProps?: Partial<P> | undefined;
};

// deno-lint-ignore no-explicit-any
export function isAsyncAnyComponent(fn: any): fn is AsyncAnyComponent<any> {
  return typeof fn === "function" && fn.constructor.name === "AsyncFunction";
}

export async function renderAsyncAnyComponent<Props>(
  fn: AsyncAnyComponent<Props>,
  props: RenderableProps<Props>,
) {
  return await tracer.startActiveSpan(
    "invoke async component",
    async (span) => {
      span.setAttribute("howl.span_type", "fs_routes/async_component");
      try {
        const result = (await fn(props)) as VNode | Response;
        span.setAttribute(
          "howl.component_response",
          result instanceof Response ? "http" : "jsx",
        );
        return result;
      } catch (err) {
        recordSpanError(span, err);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Props passed to every page, layout, and app-wrapper component.
 *
 * Mirrors the request-scoped subset of {@linkcode Context} (URL, params,
 * state, etc.) and adds a `data` field populated by the route handler.
 */
export type PageProps<Data = unknown, T = unknown> =
  & Pick<
    Context<T>,
    | "config"
    | "url"
    | "req"
    | "params"
    | "info"
    | "state"
    | "isPartial"
    | "Component"
    | "error"
    | "route"
  >
  & { data: Data };

/** A route's page component plus the handler data passed to it as props. */
export interface ComponentDef<Data, State> {
  /** Handler data, narrowed to `PageProps` by {@linkcode renderRouteComponent}. */
  props: PageProps<Data, State> | null;
  /** The page component to render. */
  component: AnyComponent<PageProps<Data, State>>;
}

/**
 * Render a route's page component to a Preact `VNode` (or a `Response` if the
 * component is an async component that returns one). Builds the full
 * {@linkcode PageProps} from `ctx` + `def.props` and places `child` at the
 * `Component` outlet. Used by the built-in Preact engine.
 */
export async function renderRouteComponent<State>(
  ctx: Context<State>,
  def: ComponentDef<unknown, State>,
  child: FunctionComponent,
): Promise<VNode | Response> {
  const vnodeProps: PageProps<unknown, State> = {
    Component: child,
    config: ctx.config,
    data: def.props,
    error: ctx.error,
    info: ctx.info,
    isPartial: ctx.isPartial,
    params: ctx.params,
    req: ctx.req,
    state: ctx.state,
    url: ctx.url,
    route: ctx.route,
  };

  if (isAsyncAnyComponent(def.component)) {
    const result = await renderAsyncAnyComponent(def.component, vnodeProps);
    if (result instanceof Response) {
      return result;
    }

    return result;
  }

  return h(def.component, vnodeProps) as VNode;
}
