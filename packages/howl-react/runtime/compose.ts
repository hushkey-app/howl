import {
  type ComponentType,
  createContext,
  createElement,
  type ReactNode,
  useContext,
} from "react";

// deno-lint-ignore no-explicit-any
type AnyComponent = ComponentType<any>;

// Carries each layout's nested child (the next layout or the page) down to its
// outlet. Module-level so `Outlet` keeps one stable component identity across
// every render and client navigation — defining it per call would give React a
// fresh element type each nav and remount the whole subtree below the layout.
const OutletContext = createContext<ReactNode>(null);

// The outlet a layout renders in place of its `Component` prop. Reads the nested
// child from the nearest provider; renders no DOM of its own.
const Outlet = (): ReactNode => useContext(OutletContext);

/**
 * Nest `[…Layouts, Page]` so each wrapper renders the next through its
 * `Component` prop (the outlet), mirroring Howl's Preact `_app` convention.
 * Shared by the server engine and the client boot so both produce an identical
 * tree — a prerequisite for clean hydration.
 *
 * The child is threaded through a stable {@link Outlet} via context rather than a
 * fresh `() => child` closure per layer, so React reconciles (instead of
 * remounting) the subtree below each layout on client navigation — preserving
 * component state such as scroll and collapse. `Outlet`/`Provider` emit no DOM,
 * so the rendered markup is identical to a direct child and hydration still
 * matches.
 */
export function composeReactTree(
  components: AnyComponent[],
  props: Record<string, unknown>,
): ReactNode {
  let node: ReactNode = createElement(components[components.length - 1], props);
  for (let i = components.length - 2; i >= 0; i--) {
    node = createElement(
      OutletContext.Provider,
      { value: node },
      createElement(components[i], { ...props, Component: Outlet }),
    );
  }
  return node;
}
