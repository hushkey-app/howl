# Spike: Vue SFC under Deno, no Vite

Proves Howl can render Vue Single-File Components without Vite — using its
existing esbuild-based toolchain instead.

## Run

```sh
deno run -A spikes/vue-no-vite/spike.ts        # options API, scoped style
deno run -A spikes/vue-no-vite/spike-setup.ts  # <script setup lang="ts">
```

Both print `✅ SPIKE PASSED`.

## What's proven

| Capability | Package | Result |
| ---------- | ------- | ------ |
| `.vue` parse + compile | `@vue/compiler-sfc` | ✅ runs clean under Deno npm-compat |
| Options-API SSR render | `@vue/server-renderer` | ✅ `renderToString` correct |
| `<script setup lang="ts">` | `compileScript` (inlineTemplate) | ✅ props / ref / computed all SSR |
| Scoped styles | `compileStyle` | ✅ `.box[data-v-<id>]` + `data-v-<id>` attrs |
| SSR semantics | — | ✅ `mounted()` does NOT run server-side |

No Vite anywhere. `@vitejs/plugin-vue` is only a wrapper around `compiler-sfc`,
which we call directly.

## Key integration notes (for `howl-vue`)

1. **TS isn't stripped by the compiler.** `compileScript` on `lang="ts"` emits
   TypeScript. The downstream bundler must transpile — in Howl that's esbuild
   (the spike writes `.ts` and lets Deno strip types to simulate this).
2. **Deno cannot import `.vue` natively.** Both the client bundle *and* the
   server (SSR + island registry) need the compile step. Client = esbuild
   `onLoad` plugin. Server = build emits compiled JS, or a startup compile hook.
3. **SSR is async** (`renderToString` returns a Promise). Howl's render pass is
   sync → Vue islands start client-only; SSR injection is a later phase.
4. **Scoped CSS** flows out of `compileStyle` as plain CSS with `[data-v-<id>]`
   selectors → drop straight into Howl's existing island-CSS asset pipeline.

## Not yet spiked

- Client hydration (`createSSRApp(C, props).mount(el)` against SSR'd DOM) —
  needs a browser; standard Vue, lower risk. Prove later with Astral.
- esbuild `.vue` `onLoad` plugin (wraps the compile shown here) — mechanical.
