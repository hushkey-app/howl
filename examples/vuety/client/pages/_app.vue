<template>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{ state?.client?.title }} · Vuety</title>
    <meta name="description" content="Full Vue pages on Howl — SSR + hydrate, no Vite." />
    <link rel="stylesheet" href="/style.css" />
    <!-- You own the whole <head>: add CSS, meta, fonts, analytics, modules… -->
    <script type="module">
      console.log("custom module script from _app.vue <head>");
    </script>
  </head>
  <body>
    <div class="app-shell">
      <header class="topbar">🐺 Vuety · {{ state?.client?.title }}</header>
      <slot />
    </div>
  </body>
</template>

<script setup lang="ts">
defineProps<{ state?: { client?: { title?: string } } }>();
</script>

<style scoped>
.topbar {
  background: #111827; 
  color: #f9fafb;
  padding: 0.6rem 1rem; 
  font-weight: 600;
}
</style>
