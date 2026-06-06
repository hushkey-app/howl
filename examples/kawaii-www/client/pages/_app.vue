<template>
  <!-- _app.vue owns the whole document and is rendered server-side only (never
       hydrated), so the theme it paints comes from the server: middleware reads
       the `theme` cookie into ctx.state, we bind it here → correct theme on
       first paint, no flash, no hydration mismatch. -->
  <html lang="en" :data-theme="theme">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="true"/>
      <link
        href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <link rel="stylesheet" href="/style.css" />
      <!-- <title> + per-page meta are managed by useHead() in each page -->
    </head>
    <body client-nav client-prefetch pinia>
      <slot />
    </body>
  </html>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";

const props = defineProps<VuePageProps<unknown, State>>();

/** Server-resolved theme (`light` | `dark`) from the `theme` cookie. */
const theme = computed(() => props.state?.client?.theme ?? "light");
</script>
