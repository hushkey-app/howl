# @hushkey/howl-react

> **Experimental.** Full **React** page support for [Howl](../howl), built on Howl's existing
> **esbuild** toolchain — **no Vite, no Next**.

Howl is Preact-native. This package adds a second render engine so React `.tsx` components can be
**full routes** alongside Preact (and Vue) in the same project. It plugs into Howl's build pipeline
rather than replacing it; the shared backend (routing, APIs, middleware, client navigation + link
prefetch, AOT/SSG, `deno compile`) is reused unchanged.

Unlike Vue, React needs **no SFC compiler**: Deno imports `.tsx` natively, so the engine renders the
source directly (dev) and embeds it into the production snapshot (prod) — the same model as the
built-in Preact engine.

## Status

| Piece                                                                                       | State           |
| ------------------------------------------------------------------------------------------- | --------------- |
| `RenderEngine` seam — `.tsx` routes SSR'd by `react-dom/server`, hydrated by `react-dom/client` | ✅ done, tested |
| esbuild plugin (`reactPlugin`) — declares `.tsx`/`.jsx` → react, sets automatic JSX          | ✅ done, tested |
| `_app.tsx` + `_layout.tsx` composition (own the document, SSR + hydrate)                     | ✅ done, tested |
| Client-nav — `client-nav` link/back-forward re-render, hover prefetch, no reload             | ✅ done, tested |
| Head/SEO — `useHead` (`@unhead/react`), SSR'd + reactive across client-nav                   | ✅ done, tested |
| Store — `jotai` atoms (SSR-safe per-request `Provider`) + `useHowlState` (`ctx.state` mirror) | ✅ done, tested |
| AOT (`__`) + SSG (`___`) — client chunk, AOT manifest, no-server-hop nav                     | ✅ done, tested |
| Prod snapshot + `deno compile` — embedded SSR modules, self-contained binary                 | ✅ done, tested |

Browser-verified end-to-end in [`examples/reacty`](../../examples/reacty) (a 1:1 mirror of
[`examples/vuety`](../../examples/vuety)).

## Full React pages (`reactEngine`)

A `.tsx` file under your pages directory is a full route rendered by React: **SSR on first load
(crawlable SEO HTML) → hydrate → live SPA** — the universal-SSR model. Howl core stays Preact;
`.tsx` routes are dispatched to the engine via the pluggable `RenderEngine` seam (`config.engines`),
opted in by registering `reactPlugin()` (which declares that `.tsx` routes render with React).

```ts
// server/main.ts
import { reactEngine } from "@hushkey/howl-react";
export const app = new Howl<State>({ engines: { react: reactEngine() } });
```

```ts
// dev.ts — register the esbuild plugin + your client entry (the _app.tsx shell)
import { reactPlugin } from "@hushkey/howl-react/plugin";
new HowlBuilder(app, {
  clientEntry: "./client/pages/_app.tsx",
  plugins: [reactPlugin()],
});
```

```tsx
// client/pages/index.tsx → GET /, server-rendered then hydrated
import type { ReactPageProps } from "@hushkey/howl-react";
export default function Index(props: ReactPageProps) {
  return <h1>Home at {props.url.pathname}</h1>;
}
```

Pages receive `ReactPageProps` — `{ url, params, query, state, data, route, isPartial, error }` — a
serialisable mirror of the server `ctx`, JSON-embedded into the hydration payload so the client tree
sees the same shape.

**`_app.tsx` + `_layout.tsx`.** An `_app.tsx` at the pages root owns the **whole document**: write
`<html>`, `<head>` (CSS, meta, fonts), and `<body>` directly, rendering the page tree at the
`props.Component` outlet. `_layout.tsx` files wrap the page per-directory. Howl renders `_app.tsx`
once server-side (it is **not** hydrated — head + static markup stay put) and scopes hydration to an
inner `#howl-app` holding the `[…Layouts, Page]` tree.

**Client navigation.** Put `client-nav` on `<body>` in `_app.tsx`. Link clicks and back/forward
inside that boundary fetch the destination's SSR HTML and **re-render** the page tree on the
persistent React root — no full reload, no re-hydration. Everything outside `#howl-app` (the
`_app.tsx` shell, plus any module-level singleton like the jotai store) stays alive across
navigations.

**Prefetch on intent.** Add a `client-prefetch` boundary to warm links on hover (after a brief
dwell), touch, or focus. Opt-in; respects `Save-Data` / `prefers-reduced-data`; exclude a subtree
with `client-prefetch="false"`.

## Head / SEO — `useHead`

Per-page `<title>` and meta via [`@unhead/react`](https://unhead.unjs.io), re-exported from a
lightweight entry so importing it into a page doesn't pull in the engine's `react-dom/server`:

```tsx
import { useHead } from "@hushkey/howl-react/head";
useHead({ title: "About", meta: [{ name: "description", content: "…" }] });
```

The engine installs an unhead provider around the tree on both server and client, so these tags are
**SSR'd** into `<head>` and stay **reactive across client navigations**. With no `useHead({ title })`
the document title falls back to `state.title` (configurable via `reactEngine({ title })`).

## Store — jotai atoms + `useHowlState`

```tsx
// store/index.store.ts
import { atom } from "@hushkey/howl-react/store";
export const countAtom = atom(0);

// a page — persists across client-nav (session-long store)
import { useAtom } from "@hushkey/howl-react/store";
const [count, setCount] = useAtom(countAtom);
```

Howl installs a jotai `Provider` around the tree: a **fresh per-request store on the server** (so
atoms never leak across concurrent requests — the key reason jotai over a module-level store) and a
**single session store on the client** (so atoms persist across client-nav). The `ctx.state` mirror
is a built-in atom — read it anywhere, no prop-drilling:

```tsx
import { useHowlState } from "@hushkey/howl-react/state";
const state = useHowlState<State>(); // re-seeded from ctx.state on every nav
```

## AOT and SSG

Filename prefixes opt a route into client-side navigation and/or build-time prerender, identical to
the Preact/Vue engines:

- `__name.tsx` → **AOT**: dynamic SSR + a client chunk that renders the route on nav with **no
  server round-trip** (props derived on the client; fetch your own data).
- `___name.tsx` → **SSG**: prerendered to static HTML at build time, plus the AOT chunk for nav.

The engine emits `window.__HOWL_REACT_AOT__` (route pattern → chunk); the client runtime intercepts
AOT-route navigation and renders the chunk directly.

## Production & `deno compile`

`deno task build` writes the client chunks, prerenders SSG routes, and emits one `.react-ssr`
wrapper per page that **statically imports** its `_app` + layout chain + page. The snapshot
static-imports those wrappers, so `deno compile` embeds the whole `.tsx` graph and the engine renders
from the embedded modules — the binary is self-contained, no source on disk at runtime.

```jsonc
// deno.json
"compile": "deno compile -A --include dist/static --output dist/bin/app dist/compiled-entry.js"
```

## TypeScript / JSX types

Deno resolves React's JSX types via `@types/react`. In your app's `deno.json`:

```jsonc
"imports": { "@types/react": "npm:@types/react@^18.3.0", /* … react, react-dom … */ },
"compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "react", "jsxImportSourceTypes": "@types/react" }
```

Add a `.d.ts` augmenting `react`'s `HTMLAttributes` so `client-nav` / `client-prefetch` type-check on
`<body>` (see [`examples/reacty/client/howl-react.d.ts`](../../examples/reacty/client/howl-react.d.ts)).

## Why no Vite / Next

Deno imports `.tsx` natively and Howl already owns an esbuild pipeline, the router, SSR, islands, and
client-nav. `reactEngine` reuses all of it — React is only the component renderer. `react` never
enters a Preact-only app's dependency graph (and vice versa); registering `reactPlugin()` is the only
wiring. Howl forces `react` → `preact/compat` for the *built-in* engine, but disables that shim for
apps that register `reactPlugin()` so they resolve real React.

## API

### `reactEngine(options?)`

The `RenderEngine` for React `.tsx` pages. `options.title?: (props) => string` sets the fallback
document title (default `state.title` or `"Howl"`).

### `reactPlugin()`

esbuild plugin that declares `.tsx`/`.jsx` → the `react` engine (via `Symbol.for("howl.engine")`) and
sets esbuild to automatic React JSX. Registering it is what routes `.tsx` through React.

### Lightweight entries

- `@hushkey/howl-react/head` — `useHead`, `useSeoMeta` (from `@unhead/react`).
- `@hushkey/howl-react/store` — `atom`, `useAtom`, `useAtomValue`, `useSetAtom` (from `jotai`).
- `@hushkey/howl-react/state` — `useHowlState<S>()`, `howlStateAtom` (the `ctx.state` mirror).
- `@hushkey/howl-react/boot` — client runtime (imported by the generated hydration chunk).
