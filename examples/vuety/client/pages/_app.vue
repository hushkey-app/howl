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
      <header class="bg-fuchsia-600 py-4 font-bold pl-10">{{ props.state?.client?.title }}</header>
      <slot />
    </div>
  </body>
</template>

<script setup lang="ts">
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";

const props = defineProps<VuePageProps<unknown, State>>();
</script>
