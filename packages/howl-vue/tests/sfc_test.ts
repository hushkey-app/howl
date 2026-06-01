import { expect } from "@std/expect";
import * as path from "@std/path";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { compileSfc } from "../sfc.ts";

const NPM_VUE = "npm:vue@^3.5.13";

/** Rewrite bare `vue` imports to npm: specifiers so the generated module can be
 * imported directly by Deno (the bundler does this resolution in production). */
function toNpm(code: string): string {
  return code
    .replaceAll('from "vue/server-renderer"', `from "${NPM_VUE}/server-renderer"`)
    .replaceAll("from 'vue/server-renderer'", `from "${NPM_VUE}/server-renderer"`)
    .replaceAll('from "vue"', `from "${NPM_VUE}"`)
    .replaceAll("from 'vue'", `from "${NPM_VUE}"`);
}

/** Compile an SFC for SSR, load it, and render it to an HTML string. */
async function ssr(
  sfc: string,
  filename: string,
  props: Record<string, unknown>,
): Promise<string> {
  const { code } = compileSfc(sfc, filename, { ssr: true });
  const dir = await Deno.makeTempDir();
  const file = path.join(dir, `${filename.replace(/\W/g, "_")}.ts`);
  await Deno.writeTextFile(file, toNpm(code));
  const mod = await import(path.toFileUrl(file).href);
  const app = createSSRApp(mod.default, props);
  return await renderToString(app);
}

Deno.test("compileSfc — options API SSR renders props + scoped attr", async () => {
  const html = await ssr(
    `<template><div class="box">Hi {{ name }}</div></template>
<script>export default { props: ["name"] }</script>
<style scoped>.box { color: red; }</style>`,
    "Box.vue",
    { name: "howl" },
  );
  expect(html).toContain("Hi howl");
  expect(html).toContain("data-v-");
});

Deno.test("compileSfc — <script setup lang=ts> SSR renders computed", async () => {
  const html = await ssr(
    `<template><p>{{ doubled }}</p></template>
<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ n: number }>();
const doubled = computed(() => props.n * 2);
</script>`,
    "Calc.vue",
    { n: 21 },
  );
  expect(html).toContain("42");
});

Deno.test("compileSfc — template-only component SSRs", async () => {
  const html = await ssr(
    `<template><span>static</span></template>`,
    "Static.vue",
    {},
  );
  expect(html).toContain("static");
});

Deno.test("compileSfc — client mode emits render, not ssrRender", () => {
  const { code } = compileSfc(
    `<template><span>x</span></template><script>export default {}</script>`,
    "X.vue",
    { ssr: false },
  );
  expect(code).toContain("function render");
  expect(code).not.toContain("ssrRender");
});

Deno.test("compileSfc — scoped styles compile with data-v selector", () => {
  const { styles, scopeId } = compileSfc(
    `<template><b/></template><style scoped>b { color: red; }</style>`,
    "B.vue",
    { ssr: true },
  );
  expect(styles[0]).toContain("[data-v-");
  expect(scopeId.startsWith("data-v-")).toBe(true);
});
