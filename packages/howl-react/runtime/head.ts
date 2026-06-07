/**
 * Per-page head/SEO hooks, re-exported from `@unhead/react` via a **lightweight**
 * entry (`@hushkey/howl-react/head`) so importing them into a `.tsx` page doesn't
 * pull in the engine's `react-dom/server` / esbuild that the main `mod.ts`
 * re-exports. Call inside a page/layout component:
 *
 * ```tsx
 * import { useHead } from "@hushkey/howl-react/head";
 * useHead({ title: "About", meta: [{ name: "description", content: "…" }] });
 * ```
 *
 * The engine installs an {@link https://unhead.unjs.io | unhead} provider around
 * the tree (server + client), so these hooks SSR into `<head>` and stay reactive
 * across client navigations.
 */
export { useHead, useSeoMeta } from "@unhead/react";
