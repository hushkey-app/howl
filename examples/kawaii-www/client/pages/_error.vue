<template>
  <main class="mx-auto flex min-h-[70vh] max-w-160 flex-col items-center justify-center px-(--pad) text-center">
    <div class="k-grad-text text-[clamp(72px,14vw,140px)] font-extrabold leading-none">{{ status }}</div>
    <h2 class="mt-1 text-[clamp(20px,3vw,28px)] font-bold">{{ message }}</h2>
    <p class="mt-3.5 max-w-[44ch] leading-[1.6] text-base-content/60">
      The page you're looking for could not be found. Head back to the home page to keep browsing.
    </p>
    <a href="/" class="k-cta mt-7">← kawaii<span class="opacity-70">(</span>home<span class="opacity-70">)</span></a>
  </main>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useHead } from "@hushkey/howl-vue/head";

const props = defineProps<{ error: { status?: number; message?: string } | null }>();

const errorMap: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error",
};

const status = computed(() => props.error?.status ?? 500);
const message = computed(() => props.error?.message || errorMap[status.value] || "Unknown error");

useHead({ title: computed(() => `${status.value} · kawaii(x,y)`) });
</script>
