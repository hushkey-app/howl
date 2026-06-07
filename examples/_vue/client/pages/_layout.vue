<template>
  <div class="layout">
    <nav class="navbar">
      <a href="/" :class="{ active: url.pathname === '/' }">Home</a>
      <a href="/about" :class="{ active: url.pathname === '/about' }">About</a>
      <a href="/about/12345" :class="{ active: route === '/about/:id' }">ID (AOT)</a>
      <a href="/ssg" :class="{ active: url.pathname === '/ssg' }">Static (SSG)</a>
      <span class="here">· routed at {{ url.pathname }}</span>
    </nav>
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";

const props = defineProps<VuePageProps<unknown, State>>();
</script>

<style scoped>
.layout {
  padding: 1.25rem;
  max-width: 42rem;
  margin: 0 auto;
}
.navbar {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}
.navbar a {
  color: #475569;
  text-decoration: none;
  font-weight: 500;
}
.navbar a.active {
  color: #4f46e5;
  font-weight: 700;
}
.navbar .here {
  color: #94a3b8;
  font-size: 0.8rem;
}
</style>
