import {
  type AnyComponent,
  type RenderableProps,
  type VNode,
} from "./component.ts";
import type { Context } from "./context.ts";

/**
 * An async page/layout component returning a `VNode`, a `Response`, or `null`.
 */
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
  /** Handler data, narrowed to `PageProps`. */
  props: PageProps<Data, State> | null;
  /** The page component to render. */
  component: AnyComponent<PageProps<Data, State>>;
}
