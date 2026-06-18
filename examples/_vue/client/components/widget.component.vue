<template>
  <div>
 <div class="widget">🧩 child component rendered — label: {{ label }}</div>
  <NestedWidgetComponent label="hello world from a nested component"/>
  </div>
</template>

<script setup lang="ts">
import NestedWidgetComponent from './nested-widget.component.vue';

defineProps<{ label: string }>();
</script>
