# @hushkey/howl-preact

> Howl's built-in **Preact** render engine, packaged as a selectable engine
> alongside [`@hushkey/howl-vue`](../howl-vue) / [`@hushkey/howl-react`](../howl-react).

Howl renders pages through a pluggable engine and has **no implicit default** —
you select one. Preact is the framework's native substrate (the client runtime,
islands, partial/AOT navigation, and `ctx.render` all live in `@hushkey/howl`
core), and this package exposes it as `preactEngine()` so the "pick your engine"
story is symmetric across Preact, Vue, and React.

## Usage

```ts
// server/main.ts
import { Howl } from "@hushkey/howl";
import { preactEngine } from "@hushkey/howl-preact";

export const app = new Howl({ engines: { preact: preactEngine() } });
```

```ts
// dev.ts — optional: makes the .tsx → Preact mapping explicit (symmetry with
// vuePlugin() / reactPlugin()). Preact is the native .tsx renderer, so a .tsx
// route already falls back to it without this.
import { preactPlugin } from "@hushkey/howl-preact/plugin";
new HowlBuilder(app, { clientEntry: "./client/pages/_app.tsx", plugins: [preactPlugin()] });
```

A `.tsx` page is rendered by Preact: SSR on first paint → hydrate → live SPA.
`_app.tsx` owns the document; `_layout.tsx` files wrap the page; `<Partial>`
regions + AOT/SSG work as before.

> **No engine selected?** If a client entry with page routes is configured but
> no engine is registered, the build throws — telling you to add one. Backend-only
> apps (no client entry) are unaffected.

## Client navigation — `client-nav` / `client-prefetch`

Put `client-nav` on `<body>` in `_app.tsx` to intercept link clicks +
back/forward for SPA-style partial navigation (no full reload); set
`client-nav="false"` on a subtree to opt it out. Add a `client-prefetch`
boundary to warm links on intent (hover dwell / touch / focus) — **opt-in**, off
by default, and AOT-aware (it pre-imports an AOT route's JS chunk, or pre-fetches
an SSR route's partial). These are the **same attributes** the Vue and React
engines use, so navigation behaves identically across all three.

> Renamed from the former `f-client-nav` / `f-prefetch` (which was prefetch
> opt-out) to unify the three engines on `client-nav` + `client-prefetch`.

## What's here vs. core

Unlike the Vue/React packages — which ship their own client `boot` runtime
because their framework isn't built in — Preact's client runtime (hydration,
partials, AOT, islands, reviver) ships with `@hushkey/howl` core. So this package
is the **server engine + the (optional) build plugin**, plus convenience
re-exports of the Preact authoring surface:

| Export | From |
| ------ | ---- |
| `preactEngine()` | this package |
| `preactPlugin()` (`./plugin`) | this package |
| `ClientOnly`, `IS_SERVER`, `IS_BROWSER`, `PageProps` | re-exported from `@hushkey/howl` |

## Packaging

Part of the engine-agnostic split: `@hushkey/howl` (core + Preact runtime) ·
`@hushkey/howl-preact` (this) · `@hushkey/howl-vue` · `@hushkey/howl-react`. Pick
the engine(s) you want; the shared backend (routing, APIs, middleware, client-nav
+ prefetch, AOT/SSG, `deno compile`) is the same under all of them.
