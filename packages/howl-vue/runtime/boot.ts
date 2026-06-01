/// <reference lib="dom" />
import { type Component, createSSRApp } from "vue";
import { mountVueIsland } from "./mount.ts";
import { composeVueTree } from "./compose.ts";
import { VUE_ISLAND_ATTR, VUE_ISLAND_PROPS_ATTR } from "./host.ts";

declare global {
  var __HOWL_VUE__: Record<string, string> | undefined;
  var __VUE_PAGE_PROPS__: Record<string, unknown> | undefined;
}

/**
 * Hydrate a full Vue *page* rendered by the Vue engine into `#howl-app`.
 * `components` is the `[App?, …Layouts, Page]` chain (outer → inner); the
 * hydration chunk Howl generates passes it. `createSSRApp().mount` adopts the
 * server-rendered markup and brings it to life as a Vue SPA.
 */
export function hydrateVuePage(components: Component[]): void {
  const el = document.getElementById("howl-app");
  if (el === null) return;
  const props = globalThis.__VUE_PAGE_PROPS__ ?? {};
  createSSRApp({ render: composeVueTree(components, props) }).mount(el);
}

/** Mounts a resolved Vue component into its container. */
export type IslandMounter = (
  component: Component,
  props: Record<string, unknown>,
  el: Element,
) => void;

/** Dynamically imports a Vue island chunk by URL. */
export type ChunkImporter = (url: string) => Promise<{ default: Component }>;

/**
 * Find every Vue island placeholder in `doc`, resolve its chunk from `manifest`
 * (island name → chunk URL), import it, and mount the component with the props
 * the server serialised. Injectable `mount` / `importer` make it testable
 * without a real bundle or browser.
 */
export function bootVueIslands(
  doc: Document,
  manifest: Record<string, string>,
  mount: IslandMounter = mountVueIsland,
  importer: ChunkImporter = (url) => import(url),
): Promise<void> {
  const jobs: Promise<void>[] = [];
  doc.querySelectorAll(`[${VUE_ISLAND_ATTR}]`).forEach((el) => {
    const name = el.getAttribute(VUE_ISLAND_ATTR);
    if (name === null) return;
    const chunk = manifest[name];
    if (chunk === undefined) {
      // deno-lint-ignore no-console
      console.warn(`No Vue island chunk registered for "${name}".`);
      return;
    }
    let props: Record<string, unknown> = {};
    const raw = el.getAttribute(VUE_ISLAND_PROPS_ATTR);
    if (raw !== null && raw !== "") {
      try {
        props = JSON.parse(raw);
      } catch {
        // deno-lint-ignore no-console
        console.warn(`Malformed props for Vue island "${name}".`);
      }
    }
    jobs.push(importer(chunk).then((mod) => mount(mod.default, props, el)));
  });
  return Promise.all(jobs).then(() => undefined);
}

if (typeof document !== "undefined") {
  const run = () => bootVueIslands(document, globalThis.__HOWL_VUE__ ?? {});
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
