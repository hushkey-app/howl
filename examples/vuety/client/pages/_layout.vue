<template>
  <div class="layout">
    <nav class="navbar">
      <a href="/" :class="{ active: url === '/' }">Home</a>
      <a href="/about" :class="{ active: url === '/about' }">About</a>
      <span class="here">· routed at {{ url }}</span>
    </nav>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ url?: string }>();

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
