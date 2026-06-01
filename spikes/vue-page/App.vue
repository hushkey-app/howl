<template>
  <main>
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
    <button class="cta" @click="count++">clicked {{ count }} times</button>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  title: string;
  description: string;
  start?: number;
}>();
const count = ref(props.start ?? 0);
</script>
