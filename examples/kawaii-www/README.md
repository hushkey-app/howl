# kawaii(x,y)

A full marketing landing page built on [Howl](../../packages/howl) with the
[`@hushkey/howl-vue`](../../packages/howl-vue) engine — **whole pages authored as Vue 3 SFCs**,
server-rendered for SEO and hydrated into a live SPA. Styled with **Tailwind v4 + daisyUI**, where
the "sunrise" brand palette is mapped straight into a pair of daisyUI themes (`light` / `dark`).

> Design ported from a static HTML/CSS/JS prototype into idiomatic howl-vue + daisyUI.

## Run

```sh
deno task dev      # → http://localhost:8000
# or a production build:
deno task build && deno task start
```

## What's here

- **`client/pages/_app.vue`** — owns the `<html>` document, loads fonts + `/style.css`, and binds
  `data-theme` from server state (`<body client-nav client-prefetch pinia>`).
- **`client/pages/index.vue`** — the entire landing page (nav, hero + live coverage card, the
  signature 24h timeline, philosophy / why-us / capabilities / process, testimonial, proof, contact,
  footer). All interactivity lives here in `<script setup>` and runs on hydration:
  - **live clocks** for the four hubs (`Intl.DateTimeFormat`, `setInterval`)
  - **animated timeline** sweep + active-lane highlighting (`requestAnimationFrame`)
  - **reveal-on-scroll** (`IntersectionObserver`)
  - **theme toggle** + fake contact-form submit
- **`client/pages/_error.vue`** — themed error page.
- **`client/data/hubs.ts`** — the four delivery hubs, shared by the hero card, timeline, and contact
  clocks so they never drift.
- **`static/style.css`** — Tailwind + daisyUI entry; the sunrise palette as two daisyUI themes plus
  a small `k-`/`mono`-prefixed custom layer for the bits utilities can't express (gradient text,
  timeline lanes, glow, status pulse).

## Notable patterns

- **No client clock flash / hydration mismatch** — clocks render `--:--` placeholders on the server
  and fill in `onMounted`; the timeline starts at `00:00 UTC` on both sides.
- **No theme flash** — the active theme is resolved from a `theme` cookie in `server/main.ts`
  middleware into `ctx.state`, so `_app.vue` paints the correct theme on the first byte. The client
  toggle rewrites the cookie for the next request.
- **`useHead`** drives the document title + meta per page.
- **Custom CSS stays collision-free** with daisyUI by prefixing everything `k-` (daisyUI already
  owns `.btn`, `.card`, `.divider`, `.label`, `.stat`, …).
