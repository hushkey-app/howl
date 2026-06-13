// Makes Howl-React's client-navigation attributes show up with autocomplete and
// type-checking inside `.tsx` pages (e.g. `<body client-nav client-prefetch>`).
// IDE-only — Deno's runtime ignores it; it augments React's element attributes.
import "react";

declare module "react" {
  interface HTMLAttributes<T> {
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
  }
}
