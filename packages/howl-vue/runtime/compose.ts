import { type Component, h, type VNode } from "vue";

/**
 * Build a render function that nests a page's component chain via slots:
 * `[App, Layout, …, Page]` (outer → inner). Each wrapper receives the same
 * page props and renders its child through its default `<slot/>`; the last
 * entry (the page) renders normally.
 *
 * Shared by the server engine and the client hydration runtime so both produce
 * an identical tree — a prerequisite for clean hydration.
 */
export function composeVueTree(
  components: Component[],
  props: Record<string, unknown>,
): () => VNode {
  const build = (i: number): VNode => {
    const Comp = components[i];
    if (i >= components.length - 1) {
      return h(Comp, { ...props });
    }
    return h(Comp, { ...props }, { default: () => build(i + 1) });
  };
  return () => build(0);
}
