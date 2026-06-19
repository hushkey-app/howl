# @hushkey/howl-vue

> **Experimental.** Vue Single-File Component support for [Howl](../howl), built on Howl's existing
> **esbuild** toolchain — **no Vite**.

Howl's core is engine-agnostic — page rendering is a registered engine. This package is the Vue
engine. It plugs into Howl's build pipeline rather than replacing it; the shared backend (routing,
APIs, middleware, client navigation + link prefetch) is reused unchanged.

## Status

| Piece                                                                                                | State           |
| ---------------------------------------------------------------------------------------------------- | --------------- |
| `.vue` → JS compiler (`compileSfc`) — options API, `<script setup>`, TS, scoped styles, SSR + client | ✅ done, tested |
| esbuild plugin (`vuePlugin`) — `.vue` `onLoad` + scoped-CSS virtual modules                          | ✅ done, tested |
| **Full Vue pages** (`.vue` routes) — `RenderEngine` seam, SSR first paint + hydrate                  | ✅ done, tested |
| **`_app.vue` + `_layout.vue`** composition (wrap the page, SSR + hydrate)                            | ✅ done, tested |
| **Client-nav** — `client-nav` link/back-forward, DOM swap + re-hydrate, hover prefetch, no reload    | ✅ done, tested |
| Head/SEO (`useHead` via `@hushkey/howl-vue/head`), Pinia, prod snapshot (precompiled SSR modules)    | ✅ done, tested |

The model is **thick client**: SSR first paint → full hydrate → SPA. There is no islands system —
interactive components are ordinary Vue components inside pages.

## Full Vue pages (`vueEngine`)

A `.vue` file under your pages directory is a full route rendered by Vue: **SSR on first load
(crawlable SEO HTML, zero JS) → hydrate → live SPA** — the universal-SSR model. `.vue` routes are
dispatched to the engine via the pluggable `RenderEngine` seam (`config.engines`).

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
`.vue`); Howl bundles a per-page hydration chunk that `createSSRApp().mount()`s `#howl-app`. A page
or layout may freely import **child `.vue` components** (compiled recursively for SSR) and **npm
packages** (e.g. `vue-sonner`) — bare imports resolve through your project's `deno.json` import map,
so a library SSR-renders the same as it does in the client bundle.

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

**`<Teleport>`.** Content teleported with `<Teleport to="body">` is server-rendered into `<body>`
(Vue collects it separately from the main stream; Howl injects it). Only `to="body"` is
server-injected — other selector targets render client-side after hydration (a dev warning flags
them). Links inside teleported content are intercepted normally: the eligible anchor is snapshotted
on `pointerdown`, so a link that detaches itself mid-click (e.g. a menu/`<Teleport>` that closes on
`@click`) still client-navigates instead of falling back to a full reload.

Scoped CSS for the whole chain is **inlined** into the document as one `<style data-howl-vue-css>`
(no extra request, no stale-chunk 404, and it travels with the client-nav swap) — so styling works
on both dev and prod. In dev, Vue pages also get a small live-reload script (they don't load any
shared framework runtime).

## Wire it into your app

Three steps:

```ts
// 1. dev.ts — register the esbuild plugin
import { vuePlugin } from "@hushkey/howl-vue/plugin";
new HowlBuilder(app, { /* … */ plugins: [vuePlugin()] });
```

```ts
// 2. server/main.ts — select the engine
import { vueEngine } from "@hushkey/howl-vue";
export const app = new Howl<State>({ engines: { vue: vueEngine() } });
```

```vue
<!-- 3. client/pages/index.vue — a route -->
<template><button @click="n++">count {{ n }}</button></template>
<script setup lang="ts">
import { ref } from "vue";
const n = ref(0);
</script>
```

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
flows into esbuild's CSS output.

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
`vue/server-renderer` imports are left for the bundler to resolve. Exposed at
`@hushkey/howl-vue/sfc` (not the package root) so a production server importing `vueEngine` never
loads `@vue/compiler-sfc` at startup — the engine and the esbuild plugin lazy-import it only when a
`.vue` file actually compiles (dev / build time).

### `hydrateVuePage(comps)` / `aotMountVuePage(comps, styles, props)`

Boot runtime entries (`@hushkey/howl-vue/boot`) imported by the generated per-page hydration chunks
— `hydrate()` re-renders the `[layouts, page]` tree over the SSR markup in `#howl-app`; `aotMount()`
renders an AOT route client-side on navigation with no server round-trip.

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
engines, and `vue` never enters a non-Vue app's dependency graph (and vice versa).

See [`spikes/vue-no-vite/`](../../spikes/vue-no-vite/) for the original feasibility proof.
