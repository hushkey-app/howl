import type { ProjectSpec, UiKit } from "../spec.ts";

/** All Vue client files for a fullstack-vue project (keyed by rel path). */
export function vueFiles(spec: ProjectSpec): Record<string, string> {
  const ui = spec.ui as UiKit;
  return {
    "client/howl-vue.d.ts": howlVueDts(),
    "client/pages/_app.vue": appVue(ui),
    "client/pages/index.vue": indexVue(spec.name, ui),
    "client/pages/_error.vue": errorVue(ui),
  };
}

function howlVueDts(): string {
  return `// Adds Howl-Vue's client-navigation attributes to .vue templates.
import "@vue/runtime-dom";

declare module "@vue/runtime-dom" {
  interface HTMLAttributes {
    /** Opt a subtree into client-side navigation (in-place region swap). */
    "client-nav"?: boolean | "true" | "false";
    /** Opt a subtree into prefetch-on-intent (hover / touch / focus). */
    "client-prefetch"?: boolean | "true" | "false";
  }
}
`;
}

function appVue(ui: UiKit): string {
  const bodyClass = ui === "daisyui"
    ? `class="bg-base-100 text-base-content min-h-screen"`
    : `class="min-h-screen bg-white text-neutral-900"`;
  const theme = ui === "daisyui" ? ` data-theme="light"` : "";
  return `<template>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body client-nav client-prefetch${theme} ${bodyClass}>
    <slot />
  </body>
</template>

<script setup lang="ts">
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";

defineProps<VuePageProps<unknown, State>>();
</script>
`;
}

function indexVue(name: string, ui: UiKit): string {
  const primary = ui === "daisyui"
    ? "btn btn-primary btn-sm"
    : "rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700";
  const ghost = ui === "daisyui"
    ? "btn btn-outline btn-sm"
    : "rounded border px-3 py-1.5 text-sm hover:bg-neutral-100";
  const muted = ui === "daisyui" ? "text-base-content/70" : "text-neutral-500";
  return `<template>
  <main class="mx-auto max-w-xl space-y-6 p-6">
    <header>
      <h1 class="text-2xl font-bold">🟢 {{ props.state.title }}</h1>
      <p class="${muted}">Vue on Howl. SSR → hydrate → SPA. No Vite.</p>
    </header>
    <section class="space-y-2">
      <p class="text-lg font-semibold">Count: {{ count }}</p>
      <div class="flex gap-2">
        <button type="button" class="${primary}" @click="count++">Increment</button>
        <button type="button" class="${ghost}" @click="count = 0">Reset</button>
      </div>
    </section>
    <section class="space-y-2">
      <button type="button" class="${ghost}" @click="ping">Ping the API</button>
      <p class="${muted}">{{ pong ?? "Not called yet." }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useHead } from "@hushkey/howl-vue/head";
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";

const props = defineProps<VuePageProps<unknown, State>>();
const count = ref(0);
const pong = ref<string | null>(null);

useHead({
  title: "${name}",
  meta: [{ name: "description", content: "A Howl + Vue app." }],
});

async function ping() {
  const res = await fetch("/api/public/ping");
  const data = await res.json();
  pong.value = data.message;
}
</script>
`;
}

function errorVue(ui: UiKit): string {
  const accent = ui === "daisyui" ? "text-error" : "text-red-600";
  const muted = ui === "daisyui" ? "text-base-content/70" : "text-neutral-500";
  return `<template>
  <main class="mx-auto my-20 max-w-xl text-center">
    <h1 class="mb-2 text-6xl font-bold ${accent}">{{ status }}</h1>
    <p class="mb-6 ${muted}">{{ message }}</p>
    <a href="/" class="underline">Go back home</a>
  </main>
</template>

<script setup lang="ts">
import type { VuePageProps } from "@hushkey/howl-vue";

const props = defineProps<VuePageProps>();
const err = props.error as { status?: number; message?: string } | null;
const status = err?.status ?? 500;
const message = err?.message ?? "Something went wrong.";
</script>
`;
}
