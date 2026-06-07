# @hushkey/howl-vue

> **Experimental.** Vue Single-File Component support for [Howl](../howl), built on Howl's existing
> **esbuild** toolchain — **no Vite**.

Howl is Preact-native. This package adds a second render engine so Vue `.vue` components can live
alongside Preact in the same project. It plugs into Howl's build pipeline rather than replacing it;
the shared backend (routing, APIs, middleware, client navigation + link prefetch) is reused
unchanged.

## Status

| Piece                                                                                                | State           |
| ---------------------------------------------------------------------------------------------------- | --------------- |
| `.vue` → JS compiler (`compileSfc`) — options API, `<script setup>`, TS, scoped styles, SSR + client | ✅ done, tested |
| esbuild plugin (`vuePlugin`) — `.vue` `onLoad` + scoped-CSS virtual modules                          | ✅ done, tested |
| Client island runtime — `VueIsland` host + `bootVueIslands` + `mountVueIsland`                       | ✅ done, tested |
| Howl build wiring — crawl `.island.vue`, bundle chunks, emit `window.__HOWL_VUE__` manifest          | ✅ done, tested |
| **Full Vue pages** (`.vue` routes) — `RenderEngine` seam, SSR first paint + hydrate                  | ✅ done, tested |
| **`_app.vue` + `_layout.vue`** composition (wrap the page, SSR + hydrate)                            | ✅ done, tested |
| **Client-nav** — `client-nav` link/back-forward, DOM swap + re-hydrate, hover prefetch, no reload    | ✅ done, tested |
| Vue island SSR (no flash, async pre-pass)                                                            | ⬜ later        |
| Vue pages: head/SEO API, prod snapshot                                                               | ⬜ later        |

Vue islands **and** full Vue pages both work end-to-end (browser-verified in `examples/www` `/vue`
and `examples/vuety` `/page`).

## Full Vue pages (`vueEngine`)

A `.vue` file under your pages directory is a full route rendered by Vue: **SSR on first load
(crawlable SEO HTML, zero JS) → hydrate → live SPA** — the universal-SSR model. Howl core stays
Preact; `.vue` routes are dispatched to the engine via the pluggable `RenderEngine` seam
(`config.engines`).

```ts
// server/main.ts
import { vueEngine } from "@hushkey/howl-vue";
export const app = new Howl<State>({ engines: { vue: vueEngine() } });
// dev.ts → plugins: [vuePlugin()]
```

```vue
<!-- client/pages/page.vue → GET /page, server-rendered then hydrated -->
<template><h1>{{ title }} at {{ url }}</h1></template>
<script setup lang="ts">
const props = defineProps<{ url: string; state: { client?: { title?: string } } }>();
const title = props.state?.client?.title ?? "Howl";
</script>
```

Pages receive `{ url, params, state, data }` as props (server `ctx` → props, JSON-serialised into
the hydration payload). The engine compiles `.vue` for SSR at request time (Deno can't import
`.vue`); Howl bundles a per-page hydration chunk that `createSSRApp().mount()`s `#howl-app`.

**`_app.vue` + `_layout.vue`.** A `_app.vue` at the pages root owns the **whole document** — write
`<head>` (CSS, meta, fonts, `<script type="module">`, analytics) and `<body>` structure directly,
with a `<slot/>` where the page goes. `_layout.vue` files wrap the page per-directory. Howl renders
`_app.vue` once server-side (it is **not** hydrated — head + static scripts stay put) and scopes
hydration to an inner `#howl-app` holding the `[layouts, page]` tree, then injects the page's CSS
`<link>` into `<head>` and the hydration scripts before `</body>`. With no `_app.vue`, Howl falls
back to a minimal shell (`<title>` from `state.client.title`).

**Client navigation.** Put `client-nav` on `<body>` in `_app.vue`. Link clicks and back/forward
inside that boundary are intercepted: Howl fetches the destination's SSR HTML, swaps the `#howl-app`
region + its props/styles/title **in place**, and re-hydrates — no full reload. Everything outside
`#howl-app` (the `_app.vue` shell, plus any module-level singleton like a store) stays alive across
navigations. Howl still owns the router (it's fetch-and-swap, not Vue Router); each route is a
normal `.vue` page that also works on a cold load for SEO.

**Prefetch on intent.** Add a `client-prefetch` boundary (e.g. `<body client-nav client-prefetch>`)
to warm links inside it on hover (after a brief dwell), touch, or keyboard focus — the destination's
SSR HTML is fetched ahead so the click swap is instant. **Opt-in** (off without the attribute);
respects `Save-Data` / `prefers-reduced-data`; exclude a link or subtree with
`client-prefetch="false"`.

Scoped CSS for the whole chain is **inlined** into the document as one `<style data-howl-vue-css>`
(no extra request, no stale-chunk 404, and it travels with the client-nav swap) — so styling works
on both dev and prod. In dev, Vue pages also get a small live-reload script (they don't load Howl's
Preact runtime).

**Current limits:** dedicated head/SEO API for _pages_ (today only `_app.vue` controls `<head>`, and
its content is static); the prod snapshot of `vuePages` (the JS hydration chunk map) is still to
wire, so on a production build pages SSR + style correctly but **hydration** runs in `dev` only.

**Island model (client-only, mirrors AOT).** A `.vue` component can't be a Preact `vnode.type`,
can't be imported by Deno on the server, and SSRs asynchronously — so Vue islands don't ride Howl's
Preact island registry. Instead a Preact host `<VueIsland name="…" props={…} />` renders a
`<div data-howl-vue>` marker. At build time Howl discovers each `.island.vue`, bundles it (and the
boot runtime) via `vuePlugin`, and emits `window.__HOWL_VUE__ = { name: chunkUrl }`. On the client
`bootVueIslands` reads that manifest, imports the chunk, and mounts the Vue component into the
marker. No server-side `.vue` import, no Preact-registry interop.

## Wire it into your app

Three steps:

```ts
// 1. dev.ts — register the esbuild plugin
import { vuePlugin } from "@hushkey/howl-vue/plugin";
new HowlBuilder(app, { /* … */ plugins: [vuePlugin()] });
```

```vue
<!-- 2. client/islands/counter.island.vue -->
<template><button @click="n++">count {{ n }}</button></template>
<script setup lang="ts">
import { ref } from "vue";
const props = defineProps<{ start?: number }>();
const n = ref(props.start ?? 0);
</script>
```

```tsx
// 3. any Preact page — name matches the filename
import { VueIsland } from "@hushkey/howl-vue";
<VueIsland name="counter" props={{ start: 41 }}>
  <button disabled>loading…</button>
  {/* optional skeleton */}
</VueIsland>;
```

Vue islands live in the islands directory (top-level `.island.vue`); colocated `(_islands)/*.vue`
isn't supported yet. The island is **client-only** (mounts after load); SSR is a later phase.

## Router — `navigate` / `useNavigate` / `useRoute`

Link clicks inside a `client-nav` boundary already navigate without a full reload. For
**programmatic** navigation — from event handlers, stores, anywhere — import from
`@hushkey/howl-vue/router`:

```ts
import { navigate, useNavigate, useRoute } from "@hushkey/howl-vue/router";

// Bare function — works in any client code, not just components
navigate("/dashboard"); // push + client-render the page
navigate("/login", { replace: true }); // replace the current history entry
navigate("/posts", { scroll: false }); // keep scroll position
navigate(-1); // history.go(-1) — back; navigate(1) = forward
```

```vue
<script setup lang="ts">
import { useNavigate, useRoute } from "@hushkey/howl-vue/router";
const navigate = useNavigate();
const route = useRoute();   // reactive: route.path, route.params, route.query, route.route
</script>
<template>
  <button @click="navigate('/next')">Next</button>
  <small>{{ route.path }}</small>
</template>
```

`navigate` routes through the same AOT/SSR swap path as link clicks but **bypasses** the
`client-nav` boundary check; before hydration / during SSR it falls back to a full navigation, so
it's always safe to call. `back()` / `forward()` are exported shorthands. `useRoute()` returns a
reactive `{ href, path, query, params, hash, route }` (provided via `inject`, so it's per-request on
SSR and per-session on the client — no cross-request leak).

### DevTools — the built-in Routes tab

In dev, the engine emits a route map (`window.__HOWL_ROUTES__`) and the boot runtime installs a
minimal `vue-router`-shaped object on `app.config.globalProperties.$router` **before mount** — the
exact surface Vue DevTools' built-in **Routes** tab reads (`$router.options.routes` +
`$router.currentRoute.value`, navigation via `$router.push`). So the native Routes tab populates
with every Howl route and its current match, even though Howl doesn't use `vue-router`. It's
dev-only (gated on the route map's presence) and adds no runtime dependency — just a plain object
fed by Howl's route map and reactive route. Must be installed before `app.mount()`: DevTools reads
`$router` on the `app:init` hook that mounting fires.

## API

### `vuePlugin(options?)`

esbuild plugin that compiles `.vue` files. Each `<style>` block becomes a virtual CSS module so it
flows into esbuild's CSS output (and Howl's island-CSS asset pipeline).

```ts
import { vuePlugin } from "@hushkey/howl-vue/plugin";

new HowlBuilder(app, {
  plugins: [vuePlugin()], // client build (browser render)
});
```

`options.ssr` (default `false`) emits `ssrRender` functions for `@vue/server-renderer` instead of
browser render functions.

### `compileSfc(source, filename, options?)`

Lower-level: compile one SFC string to `{ code, styles, scopeId }`. Bare `vue` /
`vue/server-renderer` imports are left for the bundler to resolve.

### `<VueIsland name props>` + `bootVueIslands(doc, manifest)`

`VueIsland` is a Preact host placeholder used inside a Preact page; it renders the
`<div data-howl-vue>` marker. `bootVueIslands` runs on the client (import `@hushkey/howl-vue/boot`
from your client entry), scans for markers, and mounts each from the manifest. Both `mount` and the
chunk `importer` are injectable for testing.

```tsx
import { VueIsland } from "@hushkey/howl-vue";
// chart.island.vue ←→ name="chart"
<VueIsland name="chart" props={{ points }}>
  <span>loading…</span> {/* optional skeleton */}
</VueIsland>;
```

### `mountVueIsland(component, props, container)`

Client adapter: `createSSRApp(component, props).mount(container)` — hydrates in place over SSR
markup, or renders fresh otherwise. The Vue analogue of Howl's Preact hydrate/render branch.

## Standalone rendering — `ctx.renderToString`

The engine also backs `ctx.renderToString(component, props?)` for templates rendered **outside** the
page flow (emails, notifications) — a bare Vue component to an HTML string (via
`vue/server-renderer`), no `_app.vue`/layout shell:

```ts
const html = await ctx.renderToString(WelcomeEmail, { name: user.name });
```

## Why no Vite

`@vitejs/plugin-vue` only wraps `@vue/compiler-sfc`, which is standalone. Howl calls it directly
from an esbuild `onLoad` hook. This keeps **one** dev story (full-reload live-reload) across both
engines, and `vue` never enters a Preact-only app's dependency graph (and vice versa).

See [`spikes/vue-no-vite/`](../../spikes/vue-no-vite/) for the original feasibility proof.
