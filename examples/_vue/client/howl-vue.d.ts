// Makes Howl-Vue's client-navigation attributes show up with autocomplete and
// type-checking inside `.vue` templates (e.g. `<body client-nav client-prefetch>`).
// IDE-only — Deno ignores this; it augments Vue's element attribute types.
import "@vue/runtime-dom";

declare module "@vue/runtime-dom" {
  interface HTMLAttributes {
    /**
     * Opt a subtree into client-side navigation — link clicks + back/forward
     * swap the `#howl-app` region in place instead of a full reload. Set to
     * `"false"` to disable within an enclosing `client-nav` boundary.
     */
    "client-nav"?: boolean | "true" | "false";
    /**
     * Opt a subtree into prefetch-on-intent — `client-nav` links inside are
     * warmed on hover / touch / focus so the swap is instant. Set to `"false"`
     * to exclude a link or region.
     */
    "client-prefetch"?: boolean | "true" | "false";

    /**
     * Opt a pinia store
     * Automatically sync state and serialiase from the server on rendering
     * Killer Feature.
     */
    "pinia"?: boolean | "true" | "false";
  }
}
