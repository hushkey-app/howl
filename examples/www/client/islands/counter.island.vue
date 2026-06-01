<template>
  <button class="btn btn-primary" @click="count++">
    🟢 Vue counter: {{ count }}
  </button>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ start?: number }>();
const count = ref(props.start ?? 0);
</script>

<style scoped>
button {
  font-weight: 600;
}
</style>
