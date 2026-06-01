<template>
  <main class="container">
    <header>
      <h1>🟢 Full Vue page</h1>
      <p>
        This whole page is a <code>.vue</code> file rendered by Vue on the
        server (crawlable SEO — view source!) at <code>{{ url }}</code>, then
        hydrated into a live SPA.
      </p>
    </header>
    <section>
      <p>Server said the app title is <strong>{{ title }}</strong>.</p>
      <button class="cta" type="button" @click="count++">
        clicked {{ count }} times
      </button>
    </section>
    <section>
      <p>
        Pinia store <code>count</code> = <strong>{{ store.count }}</strong> —
        increment it, go to About and back: it persists (no reload).
      </p>
      <button class="cta" type="button" @click="store.inc()">store.inc()</button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useHead } from "@hushkey/howl-vue/head";
import { useStore } from "../store/index.store.ts";

const store = useStore();

const props = defineProps<{
  url: string;
  state: { client?: { title?: string } };
}>();

useHead({
  title: "Home · Vuety",
  meta: [
    { name: "description", content: "The Vuety home page — full Vue SSR on Howl." },
  ],
});

const title = computed(() => props.state?.client?.title ?? "unknown");
const count = ref(0);

</script>

<style scoped>
.cta {
  font: inherit;
  font-weight: 600;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #16a34a;
  background: #dcfce7;
  color: #14532d;
  cursor: pointer;
}
button {
  background-color:blue;
}
</style>
