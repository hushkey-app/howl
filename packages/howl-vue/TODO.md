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
- **`useState()` ↔ `ctx.state` auto-sync** — dedicated Pinia store id `"state"` (not `main`); engine
  seeds `pinia.state.value.state = ctx.state` on SSR and serializes it to `window.__PINIA__`;
  `useState<State>()` (from `@hushkey/howl-vue/state`) reads it anywhere with no prop-drilling. On
  client-nav the engine re-emits a `data-howl-pinia` script and boot re-syncs **only** the `state`
  store from the new request's `ctx.state` (other stores persist)
- **Prod asset cache-bust** — engine appends the build-id to user `href`/`src` in prod
  (`immutable`); dev stays `no-store`
- **IDE** — tsconfig `paths` for `@hushkey/*`; `client-nav`/`client-prefetch` typed via a `.d.ts`
- **Prod snapshot for Vue pages (request-time compile)** — `build:*` no longer crashes. The snapshot
  codegen skips the static `import` for engine routes (Deno can't import a `.vue`) and instead
  serializes `engine: "vue"` + a runtime-resolvable `filePath` (`new URL(spec, import.meta.url)`);
  the render engine compiles + loads from disk per request, exactly like dev. The `vuePages` /
  `vuePagesCss` maps are serialized with keys run through the **same** resolver so the
  hydration-chunk
  - CSS lookups in `segments.ts` match. Per-route `aot`/`ssg` flags are carried into the snapshot so
    those modes can light up next. Browser/curl-verified in prod: `/`, `/about`, dynamic `/about/42`
    all 200, SSR + hydration chunk wired (200), `useState`/Pinia intact, and prod cache-bust serves
    `/style.css?__howl_c=…` with `immutable`. (Request-time compile is now the **dev** path; prod
    uses the precompiled modules below.)
- **Build-time SSR precompile → `deno compile`-able binary.** Each `.vue` page (its `_app.vue` +
  `_layout.vue` chain + page) is esbuild-compiled to an importable SSR module at build
  (`bundleVueSsr`, `vuePlugin`'s `?howl-ssr` path → SSR render fns + `__howlStyles`), written to
  `dist/.vue-ssr/*.js` and **statically imported** by the snapshot (so a binary embeds it). Bare
  deps (`vue`, `@hushkey/howl-vue/*`) stay **external** so the precompiled component shares the
  engine's runtime instances (a bundled-in Vue would mismatch `renderToString`) and the user needn't
  declare `pinia`/`unhead`. The engine renders the precompiled
  `{ app, layouts, page, styles, pinia }` when present (`opts.module`), else request-time compiles
  (dev). Snapshot keys the module map by the same runtime-resolved `filePath` as the route.
  **`deno compile -A --include dist/static` verified**: the binary serves `/`, `/about`, `/about/42`
  (200), SSR + Pinia + cache-busted static all work, no `.vue` source on disk. (Static assets need
  `--include dist/static` — a binary reads files only from its embedded FS.)
- **One session-long app with a reactive root (client-nav model).** Instead of unmounting +
  re-creating a Vue app per nav, `hydrateVuePage` creates **one** app on first paint (hydrates the
  SSR markup) whose root renders a reactive `pageTree` (`shallowRef<() => VNode>`); client-nav just
  swaps `pageTree.value` so Vue **re-renders** (a normal patch, not re-hydration). `navigateVuePage`
  no longer unmounts or hand-swaps `#howl-app` innerHTML (Vue owns it). Fixes three things at once:
  (a) **no hydration mismatch** when a persisted Pinia store diverged from the server's fresh
  render; (b) **no Vue-devtools crash** (`reading 'app'`) from re-installing Pinia/unhead on a new
  app each nav — they're installed once; (c) unchanged layouts are **reused** (their `onMounted`
  fires once, not per nav). Browser-verified (Astral): 4 navs → store persists (count 3), `_layout`
  "hello" logs **once**, zero mismatch, zero page errors; dev + prod + error-page nav all clean.
- **Cleanup: removed dead `vuePagesCss` / `cssUrl` / `entryToCss` plumbing.** Scoped CSS is inlined
  (`<style data-howl-vue-css>`) from the precompiled module / request-time compile, so the per-page
  CSS-bundle link path was never read — dropped from `RenderEngineRenderOptions`, `segments.ts`,
  `build_cache.ts`, `dev_build_cache.ts` (+ snapshot), `builder.ts`, `esbuild.ts`, `test_utils.ts`.
  Builder also clears `.vue-pages` / `.vue-ssr` wrapper dirs each build (no stale intermediates).
- **`_error.vue` error page** (mirrors Preact `_error.tsx`). The crawler already tags it
  `{ type: Error, engine: "vue" }`; `fsItemsToCommands` now builds an engine error command for it
  (was skipped), so on a caught error `renderRoute → engine.render` SSRs it through the `_app.vue` +
  `_layout.vue` shell. Receives a serialized `error: { status, message }` prop (raw `Error` objects
  don't survive `JSON.stringify`, so SSR + hydration agree). Built like a page (hydration chunk +
  SSR precompile), so it hydrates and its `client-nav` link works. Verified dev + prod + compiled
  binary: `/nope` → 404 rendering "404 / Oops! / Not Found", clean hydration, "Go Back Home"
  client-navs home.

- **Context mirrored to the page (Vue), with typed `defineProps`.** `VuePageProps<Data, State>`
  mirrors the serialisable request-scoped `ctx` field-for-field with Preact's `PageProps`: `url` (a
  real `URL` on server **and** client — serialised to its href, revived by boot, so
  `url.pathname`/`url.searchParams` work in both), `params`, `query`, `route`, `isPartial`, `state`,
  `data`, `error`, plus `Component` (always `undefined` under Vue — layouts use `<slot/>`; kept for
  Preact shape-parity, dropped by `JSON.stringify`). Same object feeds SSR props **and** the
  hydration payload. Pages type it via `defineProps<VuePageProps<unknown, State>>()`.
  Non-serialisable `ctx` fields (`req`, `config`, `cookies`, `headers`, `info`) are excluded — a
  page runs on server **and** client, so props must serialise. Verified (binary + browser):
  `/about/42?x=1&y=2` → client `params:{id:42}`, `query:{x:1,y:2}`, `route:"/about/:id"`;
  `url.pathname` drives the layout's active link client-side; `props.state.client.title` renders.
- **`defineProps<ImportedType>()` resolution under Deno.** `@vue/compiler-sfc` needs a Node `fs` to
  resolve imported types (added a Deno-backed `fs` shim) **and** `typescript` to resolve types from
  _module_ imports (bare specifiers / path aliases like `@hushkey/howl-vue`, `@howl/config`) — wired
  via `registerTS`, with TS **lazily** imported only when a `.vue` is compiled (plugin / dev
  request-time), so the prod server + compiled binary never load it. `typescript` added as a
  build-time dep.

- **Dev error visibility for Vue render failures.** The engine wraps `render` in try/catch:
  `console.error`s `🐺 Vue render failed for <file>: <err>`, and in **dev** returns a styled error
  page with the message + stack (the huge `data:` URL the SSR compile imports from is collapsed to
  `data:…‹compiled .vue›`); in **prod** it rethrows so `_error.vue` handles it. Surfaces
  SSR-compile/import failures that the segment error handler otherwise swallowed (e.g. an unresolved
  store import) — verified the exact cause now shows in the browser **and** the server console. NB:
  the request-time (dev) SSR data-URL compile only rewrites **relative** (`./`,`../`) + known
  framework specifiers; a **value** import via a path alias (e.g. `client/store/…`) doesn't resolve
  and 500s — use a relative import for stores/utils. (Aliased _type_ imports are fine — elided; see
  TODO #10.)

- **Response headers / cookies ship with the page; `isPartial` reflects client-nav.** (a) The engine
  now merges `ctx.headers` into the page response (`mergeCtxHeaders` — `Set-Cookie` appends, others
  set), mirroring Preact's `ctx.render`, so a cookie set in middleware actually reaches the browser.
  Verified: `Set-Cookie: testing=…` ships with `/about`. (b) Client-nav fetches append
  `howl-partial=true` (boot `partialFetchUrl`, cache/history stay clean) → server `ctx.isPartial`
  true; engine strips the marker off the page's `url`/`query`. Verified: initial load
  `isPartial:false`, client-nav `isPartial:true`, `url` clean both ways.
- **AOT navigation (`__`-prefixed `.vue` routes) — zero round-trip nav.** First paint still SSRs;
  navigating **to** a `__` route client-renders its precompiled chunk with props derived on the
  client (URL, route params from a `:param`→regex match, `state` from the persisted Pinia store) — no
  SSR-HTML fetch. Pieces: `?howl-aot` plugin path (client render fn + scoped CSS as `__howlStyles`);
  builder emits an AOT wrapper (`hydrate()` + `aotMount(props)`) for `f.aot` routes and a
  `vueAot` (pattern→chunk) map; serialized into the snapshot; engine injects
  `window.__HOWL_VUE_AOT__` (via `opts.aot` from `segments`); boot matches the clicked URL, derives
  props, imports the chunk, `aotMount`s (atomic style-inject + reactive re-render). Hover prefetch
  modulepreloads the chunk for AOT routes (no HTML fetch). Same `__` convention as Preact. Demo:
  `about/__[id].vue`. Verified (Astral): nav to `/about/12345` ×2 → renders, **0 server HTML
  fetches**, params/state correct, no errors; direct landing still SSRs. Deferred: per-route **data
  loader** (AOT pages needing fresh server data — today state/param pages only); `deno compile`
  binary not re-verified for AOT (same snapshot+static path).

## 🔜 TODO (roughly prioritized)

0. **Unify the page-context shape across Preact + Vue.** Factor the serialisable client-context into
   one shared definition both engines use (Preact's `PageProps` could add `query`; the client mirror
   = the serialisable subset). Headers + `isPartial` are now wired on the Vue side (see Done).

1. **Global CSS via the compilation (`entryAssets`), not a hand-dropped `static/style.css`.** Today
   the example hand-drops `static/style.css` and `_app.vue` hard-links `<link href="/style.css">`;
   the build copies it and the engine cache-busts it in prod. The user's normal workflow is to
   **include global CSS in the compilation** (Tailwind/daisyUI via `tailwindPlugin()` → a
   build-hashed entry asset). Wire `buildCache.getEntryAssets()` CSS into the Vue engine so global
   CSS is build-managed + content-hashed and injected into `<head>` automatically — drop the manual
   `<link>`. (Was item #3.)

2. ~~Per-route data loader for AOT~~ — **not wanted** (2026-06-02). User fetches data client-side
   directly (in the page, no server loader), so AOT's state/param model is sufficient. Don't
   re-propose server loaders.

3. **Vue SSG** (`___index.vue`) — AOT + build-time prerender: run the engine once with an empty ctx
   at build, cache the HTML, serve it before the handler chain (mirrors the Preact SSG path). Reuses
   the AOT chunk + manifest for nav.

4. **Ship the attribute `.d.ts` inside the package.** The `client-nav` / `client-prefetch`
   autocomplete augmentation lives in `examples/vuety/client/howl-vue.d.ts` — move it into
   `@hushkey/howl-vue` (e.g. a `./dom` export) so every consumer gets it.

5. **`<Head>` / `<Title>` / `<Meta>` component sugar** on top of `useHead` (unhead ships them).

6. **Vue island SSR** (no flash) — async pre-pass; islands are client-only today.

7. **Colocated `(_islands)/*.vue`** — only top-level `.island.vue` is crawled today.

8. **Promote out of experimental** — finalize READMEs, JSR publish metadata, doc-lint coverage.

9. **Type imports from bare aliases must be `import type`.** The request-time (dev) SSR compile
   imports each page via a `data:` URL; only `npm:` / `file:` / the engine's known specifiers
   (`vue`, `@hushkey/howl-vue/*`, relative `./`,`../`) get rewritten. A plain
   `import { State } from "@howl/config"` used only as a type is emitted by the Vue compiler as a
   **runtime** import and 500s (`not a dependency … from data:`). Workaround today: write
   `import type { State }` (idiomatic anyway — Vue elides it). A nicer fix would read the user's
   import map so value imports of aliased modules resolve too.
