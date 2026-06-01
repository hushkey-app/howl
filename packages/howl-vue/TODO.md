# @hushkey/howl-vue — TODO

Tracking the remaining work on the Vue engine. Status as of the current branch.

## ✅ Done (browser-verified unless noted)

- **SFC compiler** (`compileSfc`) — options API, `<script setup>`, TS, scoped styles, SSR + client
- **esbuild plugin** (`vuePlugin`) — `.vue` `onLoad`, scoped-CSS virtual modules, Vue feature-flag
  `define`s
- **Vue islands** — `<VueIsland>` host + `bootVueIslands` + `window.__HOWL_VUE__` manifest
  (client-only)
- **Full Vue pages** — `RenderEngine` seam (`engines: { vue }`), SSR first paint → hydrate
- **`_app.vue` + `_layout.vue`** composition; `_app.vue` owns the whole document (`<head>`/`<body>`)
- **Scoped CSS inlined** into the document (`<style data-howl-vue-css>`, swaps with client-nav)
- **Client-nav** — `client-nav` boundary, DOM swap + re-hydrate, back/forward, no reload
- **Prefetch on intent** — `client-prefetch` (opt-in), warms HTML **and** modulepreloads the chunk
- **Hydration chunk preload** — `modulepreload` on first load; stable URL (no `?_n=`) so nav is a
  cache hit
- **Live-reload on Vue pages** (dev) — inline WS to `/_howl/alive`, backoff reconnect
- **Head/SEO** — `useHead` via `@hushkey/howl-vue/head` (lightweight re-export of unhead), SSR'd +
  nav-reactive (title + meta)
- **Pinia store** — `<body pinia>` toggle installs Pinia on the `#howl-app` app (server + client);
  SSR-serializes state to `window.__PINIA__`; client is a singleton hydrated once + **persisted
  across client-nav** (no reset). `defineStore` via `@hushkey/howl-vue/pinia`. Pages can import
  relative store/util `.ts` (engine rewrites `./`,`../` → `file://` for the SSR compile)
- **`useState()` ↔ `ctx.state` auto-sync** — dedicated Pinia store id `"state"` (not `main`);
  engine seeds `pinia.state.value.state = ctx.state` on SSR and serializes it to
  `window.__PINIA__`; `useState<State>()` (from `@hushkey/howl-vue/state`) reads it anywhere with no
  prop-drilling. On client-nav the engine re-emits a `data-howl-pinia` script and boot re-syncs
  **only** the `state` store from the new request's `ctx.state` (other stores persist)
- **Prod asset cache-bust** — engine appends the build-id to user `href`/`src` in prod
  (`immutable`); dev stays `no-store`
- **IDE** — tsconfig `paths` for `@hushkey/*`; `client-nav`/`client-prefetch` typed via a `.d.ts`

## 🔜 TODO (roughly prioritized)

1. **[BLOCKER] Prod snapshot for Vue pages.** `build:*` produces a server that **crashes on boot**:
   the snapshot codegen statically `import`s every route file, and **Deno can't import a `.vue`** →
   `Expected a JavaScript or TypeScript module … Unknown module`.

   Root cause: unlike Preact `.tsx` (Deno transpiles it on import, so the prod snapshot can import
   route modules directly and no source is "shipped" beyond the compiled bundles), a `.vue` is
   **not** a JS/TS module — it must be **compiled** first. So Vue pages can't be statically imported
   the way `.tsx` pages are. Two ways to fix, both keep `.vue` source off the server module graph:

   - **(a) Request-time compile (simplest, matches dev):** don't static-import `.vue` routes in the
     snapshot — mark them `engine: "vue"` + carry `filePath`, and let the engine `compileSfc` +
     data-URL-import them per request (already exactly how dev works; the engine path is
     engine-agnostic, so the snapshot just needs to skip the static import for engine routes).
   - **(b) Build-time precompile:** the build emits an SSR-compiled `.js` per `.vue` page and the
     snapshot imports _that_ (faster cold start, no per-request compile) — closer to the "compile
     everything to JS, ship no source" model the Preact side already uses.

   Either way, also serialize the `vuePages` chunk map into the snapshot so client **hydration** +
   the prod **cache-busting** work too. Unblocks: prod deploy + hydration + cache-bust (dev-only
   today).

2. **Ship the attribute `.d.ts` inside the package.** The `client-nav` / `client-prefetch`
   autocomplete augmentation lives in `examples/vuety/client/howl-vue.d.ts` — move it into
   `@hushkey/howl-vue` (e.g. a `./dom` export) so every consumer gets it.

3. **Global CSS via `entryAssets`.** Wire `buildCache.getEntryAssets()` CSS into the engine so
   global CSS (Tailwind/daisyUI) is build-managed + hashed instead of a hand-dropped `/style.css`.
   Pairs with adding `tailwindPlugin()` to the example.

4. **`<Head>` / `<Title>` / `<Meta>` component sugar** on top of `useHead` (unhead ships them).

5. **Vue island SSR** (no flash) — async pre-pass; islands are client-only today.

6. **Colocated `(_islands)/*.vue`** — only top-level `.island.vue` is crawled today.

7. **Cleanup:** remove the now-dormant `vuePagesCss` / esbuild `entryToCss` plumbing (CSS is inlined
   now, so the per-page `.vue` CSS chunk is built but unreferenced).

8. **Promote out of experimental** — finalize READMEs, JSR publish metadata, doc-lint coverage.

9. **Type imports from bare aliases must be `import type`.** The SSR compile imports each page via a
   `data:` URL; only `npm:` / `file:` / the engine's known specifiers (`vue`, `@hushkey/howl-vue/*`,
   relative `./`,`../`) get rewritten. A plain `import { State } from "@howl/config"` used only as a
   type is emitted by the Vue compiler as a **runtime** import and 500s
   (`not a dependency … from
   data:`). Workaround today: write `import type { State }` (idiomatic
   anyway — Vue elides it). A nicer fix would read the user's import map so value imports of aliased
   modules resolve too.
