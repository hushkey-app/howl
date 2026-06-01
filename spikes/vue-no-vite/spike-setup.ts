/**
 * Spike #2: the idiom people actually write — `<script setup lang="ts">`.
 *
 * Exercises the harder compile path:
 *   - compileScript with inlineTemplate (SSR render inlined into setup)
 *   - TypeScript inside the SFC
 *   - reactive ref + prop + computed
 *
 * Run: deno run -A spikes/vue-no-vite/spike-setup.ts
 */
import { compileScript, parse } from "npm:@vue/compiler-sfc@^3.5.13";
import { createSSRApp } from "npm:vue@^3.5.13";
import { renderToString } from "npm:vue@^3.5.13/server-renderer";

const NPM_VUE = "npm:vue@^3.5.13";

function rewriteImports(code: string): string {
  return code
    .replaceAll("from 'vue/server-renderer'", `from "${NPM_VUE}/server-renderer"`)
    .replaceAll('from "vue/server-renderer"', `from "${NPM_VUE}/server-renderer"`)
    .replaceAll("from 'vue'", `from "${NPM_VUE}"`)
    .replaceAll('from "vue"', `from "${NPM_VUE}"`);
}

const SFC = `
<template>
  <div class="card" :data-greeting="greeting">
    <h1>{{ greeting }}</h1>
    <p>doubled: {{ doubled }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{ name: string; start?: number }>();
const greeting = computed(() => \`Hello \${props.name}\`);
const count = ref(props.start ?? 0);
const doubled = computed(() => count.value * 2);
</script>

<style scoped>
.card { padding: 1rem; }
</style>
`;

const filename = "Card.vue";
const id = "card789";
const scopeId = `data-v-${id}`;

const { descriptor, errors } = parse(SFC, { filename });
if (errors.length) {
  console.error("parse errors:", errors);
  Deno.exit(1);
}
console.log("✓ parse: scriptSetup =", !!descriptor.scriptSetup, "lang =", descriptor.scriptSetup?.lang);

// compileScript handles <script setup> + TS + inlines the SSR template render.
const compiled = compileScript(descriptor, {
  id,
  inlineTemplate: true,
  templateOptions: {
    ssr: true,
    ssrCssVars: [],
    compilerOptions: { scopeId },
  },
});
console.log("✓ compileScript: bindings =", Object.keys(compiled.bindings ?? {}));

const moduleSrc = rewriteImports(`
${compiled.content.replace("export default", "const _sfc_main =")}
_sfc_main.__scopeId = ${JSON.stringify(scopeId)};
export default _sfc_main;
`);

const outDir = new URL("./_compiled/", import.meta.url);
await Deno.mkdir(outDir, { recursive: true });
// compiler-sfc emits TS when lang="ts" — write .ts so Deno strips types
// (the real pipeline hands this to esbuild). This is the key integration note.
const outFile = new URL("Card.ts", outDir);
await Deno.writeTextFile(outFile, moduleSrc);

const mod = await import(outFile.href);
const app = createSSRApp(mod.default, { name: "vue-in-howl", start: 21 });
const html = await renderToString(app);

console.log("\n--- SSR output ---\n" + html + "\n------------------\n");

const ok = html.includes("Hello vue-in-howl") &&
  html.includes("doubled: 42") &&
  html.includes(scopeId);
console.log(
  ok
    ? "✅ SPIKE #2 PASSED — <script setup lang=ts> compiles + SSRs under Deno, no Vite"
    : "❌ SPIKE #2 FAILED",
);
if (!ok) Deno.exit(1);
