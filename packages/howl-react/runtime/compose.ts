import { type ComponentType, createElement, type ReactNode } from "react";

// deno-lint-ignore no-explicit-any
type AnyComponent = ComponentType<any>;

/**
 * Nest `[…Layouts, Page]` so each wrapper renders the next through its
 * `Component` prop (the outlet), mirroring Howl's Preact `_app` convention.
 * Shared by the server engine and the client boot so both produce an identical
 * tree — a prerequisite for clean hydration.
 */
export function composeReactTree(
  components: AnyComponent[],
  props: Record<string, unknown>,
): ReactNode {
  let node: ReactNode = createElement(components[components.length - 1], props);
  for (let i = components.length - 2; i >= 0; i--) {
    const Wrapper = components[i];
    const child = node;
    node = createElement(Wrapper, { ...props, Component: () => child });
  }
  return node;
}
