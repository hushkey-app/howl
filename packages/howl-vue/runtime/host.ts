import { type ComponentChildren, h, type VNode } from "preact";

/**
 * Attribute Howl's Vue boot scanner looks for to locate a mount point.
 */
export const VUE_ISLAND_ATTR = "data-howl-vue";

/**
 * Attribute holding the JSON-serialised props for a Vue island.
 */
export const VUE_ISLAND_PROPS_ATTR = "data-howl-vue-props";

/**
 * Props for {@linkcode VueIsland}.
 */
export interface VueIslandProps {
  /**
   * Island name — must match the `.island.vue` filename (without extension).
   * The build maps this name to the compiled client chunk.
   */
  name: string;
  /** Props passed to the Vue component on the client. Must be JSON-serialisable. */
  props?: Record<string, unknown>;
  /** Optional placeholder shown until the Vue component mounts on the client. */
  children?: ComponentChildren;
}

/**
 * Preact host placeholder for a Vue island. Rendered inside an ordinary Preact
 * page, it emits a `<div data-howl-vue>` marker carrying the island name and
 * serialised props; the client boot ({@linkcode bootVueIslands}) then imports
 * the matching chunk and mounts the real Vue component into it.
 *
 * This mirrors how Howl's AOT routes work — a manifest plus client-side
 * dispatch — and sidesteps the fact that a `.vue` component can't be a Preact
 * `vnode.type` or be imported by Deno on the server.
 */
export function VueIsland(props: VueIslandProps): VNode {
  const attrs: Record<string, unknown> = {
    [VUE_ISLAND_ATTR]: props.name,
    [VUE_ISLAND_PROPS_ATTR]: JSON.stringify(props.props ?? {}),
    style: "display:contents",
  };
  return h("div", attrs as any, props.children ?? null);
}
