/// <reference lib="dom" />
import { type Component, createApp, createSSRApp } from "vue";

/**
 * Mount a compiled Vue island into its container.
 *
 * Vue islands are client-only for now (the server emits an empty/skeleton
 * marker), so this uses `createApp().mount()` — it replaces the container's
 * contents with a fresh client render. Pass `hydrate: true` once the SSR phase
 * lands and the marker already holds server-rendered Vue markup, to switch to
 * `createSSRApp().mount()` (in-place hydration) instead.
 */
export function mountVueIsland(
  component: Component,
  props: Record<string, unknown>,
  container: Element,
  hydrate = false,
): void {
  const app = hydrate ? createSSRApp(component, props) : createApp(component, props);
  app.mount(container);
}
