/**
 * Framework-neutral component type aliases. Howl core renders nothing itself —
 * rendering is owned by engines (`@hushkey/howl-vue` / `@hushkey/howl-react`),
 * so these are structural placeholders for the page-props / route-component
 * types that survive in the engine seam. No Preact (or any framework) here.
 *
 * @module
 */

/** Any component value (function or class) accepting props `P`. */
// deno-lint-ignore no-explicit-any
export type AnyComponent<P = any> = (props: P) => unknown;

/** A component value accepting props `P`. */
// deno-lint-ignore no-explicit-any
export type ComponentType<P = any> = (props: P) => unknown;

/** A function component accepting props `P`. */
// deno-lint-ignore no-explicit-any
export type FunctionComponent<P = any> = (props: P) => unknown;

/** An opaque rendered node (engine-specific; core never inspects it). */
// deno-lint-ignore no-explicit-any
export type VNode<_T = any> = unknown;

/** Props `P` plus optional children — mirrors a framework's renderable props. */
// deno-lint-ignore no-explicit-any
export type RenderableProps<P> = P & { children?: any };
