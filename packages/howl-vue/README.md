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
| Vue island SSR (no flash, async pre-pass)                                                            | ⬜ later        |
| Vue pages: head/SEO API, SPA nav, prod snapshot                                                      | ⬜ later        |

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

**Current limits:** dedicated head/SEO API for *pages* (today only `_app.vue` controls `<head>`, and
its content is static); SPA navigation is per-request SSR (Vue Router vs Howl fetch-and-swap is a
later decision); prod snapshot of `vuePages`/`vuePagesCss` is still to wire (page hydration + CSS
work in `dev` only).

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

## Why no Vite

`@vitejs/plugin-vue` only wraps `@vue/compiler-sfc`, which is standalone. Howl calls it directly
from an esbuild `onLoad` hook. This keeps **one** dev story (full-reload live-reload) across both
engines, and `vue` never enters a Preact-only app's dependency graph (and vice versa).

See [`spikes/vue-no-vite/`](../../spikes/vue-no-vite/) for the original feasibility proof.
