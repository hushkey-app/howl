<template>
    <main class="container">
        <header>
            <h1>🟢 Full Vue page</h1>
            <p>
                This whole page is a <code>.vue</code> file rendered by Vue on
                the server (crawlable SEO — view source!) at
                <code>{{ url.pathname }}</code>, then hydrated into a live SPA.
            </p>
        </header>
        <section>
            <p>
                Server said the app title is <strong>{{ title }}</strong>.
            </p>
            <button class="cta" type="button" @click="store.inc()">
                clicked {{ store.count }} times
            </button>
            <Widget label="from index page" />
        </section>
    </main>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useHead } from "@hushkey/howl-vue/head";
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";
import { useStore } from "../store/index.store.ts";
import Widget from "../components/widget.component.vue";

const store = useStore();
const props = defineProps<VuePageProps<unknown, State>>();

useHead({
    title: "Home · Vuety",
    meta: [
        {
            name: "description",
            content: "The Vuety home page — full Vue SSR on Howl.",
        },
    ],
});

const title = computed(() => props.state?.client?.title ?? "unknown");
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
    background-color: blue;
}
</style>
