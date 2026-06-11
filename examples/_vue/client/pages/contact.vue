<template>
    <main class="container">
        <h1>MIMMORAGNO</h1>
    </main>
</template>

<script setup lang="ts">
import { useHead } from "@hushkey/howl-vue/head";
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";

const props = defineProps<VuePageProps<unknown, State>>();

useHead({
    title: "Contact · Vuety",
    meta: [
        { name: "description", content: "The Vuety home page — full Vue SSR on Howl." },
    ],
});


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
