// IDE-ONLY module shims for the Vue ts-plugin (Volar). Script blocks inside
// `.vue` files are resolved with plain TypeScript resolution, which cannot
// follow Deno's jsr: import map — without these, imports from
// "@hushkey/howl-vue/*" show ts-plugin(2307) in the editor.
//
// Deno never loads this file (it is in no import graph) and MUST NOT check
// it: under Deno's resolver these module names resolve for real, which turns
// the declarations into illegal augmentations. Volar, which cannot resolve
// them, treats them as the ambient declarations they are meant to be.

declare module "@hushkey/howl-vue/head" {
  export { useHead, useSeoMeta } from "@unhead/vue";
}

declare module "@hushkey/howl-vue" {
  /** Props every Howl-Vue page/app component receives. */
  export interface VuePageProps<Data = unknown, State = Record<string, unknown>> {
    /** Per-request state set by middleware (serialized into the page). */
    state?: State;
    /** Route handler data, when the route provided any. */
    data?: Data;
    /** Current URL of the rendered page. */
    url: URL;
    /** Matched route params. */
    params: Record<string, string>;
  }
}
