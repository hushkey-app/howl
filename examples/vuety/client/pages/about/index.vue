<template>
  <main class="container">
    <header>
      <h1>📖 About</h1>
      <p>
        A second full Vue page, served at <code>{{ url }}</code> by Howl's own
        file-system router — no Vue Router involved.
      </p>
    </header>
    <section>
      <p>Its own counter, to prove this route hydrates independently:</p>
      <button class="cta" type="button" @click="count++">
        clicked {{ count }} times
      </button>
    </section>
    <section>
      <p>
        From the auto-synced <code>state</code> store (mirrors server
        <code>ctx.state</code>, no prop-drilling): app title =
        <strong>{{ state.client?.title }}</strong>.
        <strong>{{ state.user }}</strong>.
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useHead } from "@hushkey/howl-vue/head";
import { useState } from "@hushkey/howl-vue/state";
import type { State } from "@howl/config";

defineProps<{ url: string }>();
const count = ref(0);
const state = useState<State>();

useHead({
  title: "About · Vuety",
  meta: [{ name: "description", content: "About this Vue-on-Howl demo." }],
});
</script>

<style scoped>
.cta {
  font: inherit;
  font-weight: 600;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #6366f1;
  background: #e0e7ff;
  color: #312e81;
  cursor: pointer;
}
</style>
