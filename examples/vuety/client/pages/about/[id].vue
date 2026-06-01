<template>
  <main class="container">
  <!-- {{ props.ctx.url.hostname }} -->
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

// import { Context } from "@hushkey/howl";
// import { State } from "@howl/config";

const props = defineProps<{ url: string }>();

onMounted(()=> console.log(props))
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
