<template>
  <main class="container">
    <section class="error">
      <h1>{{ status }}</h1>
      <h2>Oops!</h2>
      <p>{{ message }}</p>
      <p>
        The page you're looking for could not be found. We appreciate if you
        could go back to the home page to continue browsing.
      </p>
      <a href="/" class="cta">Go Back Home</a>
    </section>
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
const message = computed(() => errorMap[status.value] ?? "Unknown error");

useHead({ title: computed(() => `Error ${message.value}`) });
</script>

<style scoped>
.error {
  max-width: 40rem;
  margin: 5rem auto;
  text-align: center;
}
.error h1 {
  font-size: 4rem;
  font-weight: 700;
  color: #dc2626;
  margin: 0;
}
.error h2 {
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0.25rem 0;
}
.error p {
  color: #4b5563;
  line-height: 1.6;
}
.cta {
  display: inline-block;
  margin-top: 1.5rem;
  font-weight: 600;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #16a34a;
  background: #dcfce7;
  color: #14532d;
  text-decoration: none;
}
</style>
