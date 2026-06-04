<template>
  <main class="container">
    <header>
      <h1>🧊 Static (SSG) page</h1>
      {{ state.user.first_name }}
      <p>
        This page is <strong>prerendered at build time</strong> and served as a
        static file — no server render on request. It still hydrates into a live
        SPA, and navigation to/from it uses the AOT client chunk.
      </p>
    </header>
    <section>
      <p>
        The store starts at its build-time default (<code>count: 0</code>,
        serialized in <code>__PINIA__</code> so server + client agree — no
        recompute, no mismatch), then it's live after hydration and persists
        across navigation:
      </p>
      <button class="cta" type="button" @click="store.inc()">
        store.count = {{ store.count }}
      </button>
      <p class="note">
        Note: a value computed in the component (e.g. <code>new Date()</code>)
        is <em>not</em> frozen — <code>setup()</code> re-runs on the client and
        recomputes it (and mismatches the static HTML). Frozen values must be
        serialized (store / <code>state</code> / a loader). To see the real build
        artifact, View&nbsp;Source.
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useHead } from "@hushkey/howl-vue/head";
import { useStore } from "../store/index.store.ts";
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";

const store = useStore();
const props = defineProps<VuePageProps<unknown, State>>();

useHead({
  title: "Static · Vuety",
  meta: [{ name: "description", content: "A build-time prerendered SSG page." }],
});

</script>

<style scoped>
.cta {
  font: inherit;
  font-weight: 600;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #0ea5e9;
  background: #e0f2fe;
  color: #075985;
  cursor: pointer;
}
.note {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.5;
}
</style>
