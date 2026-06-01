<template>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- <title> + per-page meta are managed by useHead() in each page -->
    <link rel="stylesheet" href="/style.css" /> 
    <!-- we will have look to build a client entry so I can import css 
     and bundle everything instead using the network -->
  </head>
  <body client-nav client-prefetch pinia>
    <div class="app-shell">
      <header class="bg-fuchsia-600 py-4">{{ state?.client?.title }}</header>
      <slot />
    </div>
  </body>
</template>

<script setup lang="ts">
defineProps<{ state?: { client?: { title?: string } } }>();
</script>
