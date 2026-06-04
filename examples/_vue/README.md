# Vuety

A minimal [Howl](../../packages/howl) app showcasing **Vue 3 islands** via
[`@hushkey/howl-vue`](../../packages/howl-vue): Vue single-file components compiled with esbuild —
**no Vite** — and mounted as client islands inside Preact-rendered pages.

## Run

```sh
deno task dev:vuety        # from the repo root → http://localhost:8000
# or a production build:
deno task build:vuety && deno task start:vuety
```

## What's here

- `client/islands/*.island.vue` — three Vue SFCs using `<script setup lang="ts">` and scoped
  `<style>`:
  - **counter** — `ref` + click event
  - **greeter** — `props` + `computed` + `v-model`
  - **todos** — reactive list + `v-for` + add/remove
- `client/pages/index.tsx` — a Preact page that hosts them with `<VueIsland name="…" props={…} />`
  (the `name` matches the `.island.vue` filename).
- `dev.ts` — the only wiring needed: `plugins: [vuePlugin()]`.

## Notes

Vue islands are **client-only** today: the server renders the skeleton inside each `<VueIsland>`,
and the Vue component mounts on load. SSR (no flash) and nicer authoring are on the howl-vue
roadmap.
