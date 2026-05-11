# {{PROJECT_NAME}}

A Howl starter demonstrating the three rendering modes side-by-side:

| File                          | Mode | When does the renderer run?     |
| ----------------------------- | ---- | ------------------------------- |
| `client/pages/index.tsx`      | SSR  | Every request                   |
| `client/pages/__dashboard.tsx`| AOT  | First request only — then the client chunk takes over |
| `client/pages/__profile.tsx`  | AOT  | First request only              |
| `client/pages/__settings.tsx` | AOT  | First request only              |
| `client/pages/___about.tsx`   | SSG  | Once at build time              |

## Setup

```sh
deno install
cp .env.example .env
deno task dev
```

Open <http://127.0.0.1:8000> and look at the **Network** tab while you click
between the links in the nav bar.

- `SSR` link click → a `?howl-partial=true` fetch returns a fragment
- `AOT` link click → a tiny `aot__*.js` chunk loads (only on first visit)
- `SSG` direct URL hit → no renderer runs, prerendered HTML is served from the
  build snapshot

## File naming

- `pages/foo.tsx` → SSR (renderer runs every request)
- `pages/__foo.tsx` → AOT (SSR first paint + client-nav chunk)
- `pages/___foo.tsx` → SSG (prerendered HTML + client-nav chunk)

The double / triple underscore is stripped from the URL pattern, so
`__dashboard.tsx` mounts at `/dashboard`.

## Limits (today)

- SSG handlers run with an empty `ctx` — no `req`, no cookies, no per-user
  state. Anything per-user belongs on the regular dynamic SSR path.
- Dynamic-param routes (e.g. `/blog/[slug]`) on SSG fall through to dynamic
  SSR with a build-time warning. A `getStaticPaths`-style API is on the
  roadmap.
- On AOT-flagged pages, `useEffect` inside the page component does not fire on
  direct URL hits — only after the first client navigation. Use islands
  (`*.island.tsx`) for behaviour that must run on first paint.

## Production

```sh
deno task build && deno task start
```

`deno task build` runs the SSG prerender pass and serializes everything into
`dist/snapshot.js`. AOT chunks are served from `dist/static/_howl/js/{BUILD_ID}/`
with `Cache-Control: immutable` headers.
