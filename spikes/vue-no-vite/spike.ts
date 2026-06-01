/**
 * Feasibility spike: compile a Vue SFC and SSR it under Deno, no Vite.
 *
 * Proves the three standalone pieces work together:
 *   1. @vue/compiler-sfc  — .vue source  -> JS (template/script/scoped style)
 *   2. vue                — createSSRApp
 *   3. vue/server-renderer — renderToString
 *
 * Run: deno run -A spikes/vue-no-vite/spike.ts
 */
import {
  compileStyle,
  compileTemplate,
  parse,
} from "npm:@vue/compiler-sfc@^3.5.13";
import { createSSRApp } from "npm:vue@^3.5.13";
import { renderToString } from "npm:vue@^3.5.13/server-renderer";

const NPM_VUE = "npm:vue@^3.5.13";

/** Rewrite bare `vue` / `vue/server-renderer` imports to npm: specifiers so
 * the generated module resolves without an import map. */
function rewriteImports(code: string): string {
  return code
    .replaceAll("from 'vue/server-renderer'", `from "${NPM_VUE}/server-renderer"`)
    .replaceAll('from "vue/server-renderer"', `from "${NPM_VUE}/server-renderer"`)
    .replaceAll("from 'vue'", `from "${NPM_VUE}"`)
    .replaceAll('from "vue"', `from "${NPM_VUE}"`);
}

const SFC = `
<template>
  <div class="box">Hello {{ name }} — count {{ count }}</div>
</template>

<script>
export default {
  props: { name: { type: String, default: "world" } },
  data() {
    return { count: 41 };
  },
  mounted() {
    this.count++; // client-only; must NOT run during SSR
  },
};
</script>

<style scoped>
.box { color: rebeccapurple; }
</style>
`;

const filename = "Demo.vue";
const id = "demo123";
const scopeId = `data-v-${id}`;

// 1. Parse the SFC into its blocks.
const { descriptor, errors } = parse(SFC, { filename });
if (errors.length) {
  console.error("parse errors:", errors);
  Deno.exit(1);
}
console.log("✓ parse: blocks =", {
  template: !!descriptor.template,
  script: !!descriptor.script,
  styles: descriptor.styles.length,
  scoped: descriptor.styles.some((s) => s.scoped),
});

// 2. Compile the template to an SSR render function.
const tpl = compileTemplate({
  source: descriptor.template!.content,
  filename,
  id,
  ssr: true,
  scoped: descriptor.styles.some((s) => s.scoped),
  compilerOptions: { scopeId },
});
if (tpl.errors.length) {
  console.error("template errors:", tpl.errors);
  Deno.exit(1);
}
console.log("✓ compileTemplate (ssr): produced ssrRender");

// 3. Compile the scoped style.
const style = compileStyle({
  source: descriptor.styles[0].content,
  filename,
  id,
  scoped: true,
});
console.log("✓ compileStyle (scoped):", style.code.trim());

// 4. Assemble a loadable module.
const scriptContent = descriptor.script!.content.replace(
  "export default",
  "const _sfc_main =",
);
const moduleSrc = rewriteImports(`
${scriptContent}
${tpl.code.replace("export function ssrRender", "function ssrRender")}
_sfc_main.ssrRender = ssrRender;
_sfc_main.__scopeId = ${JSON.stringify(scopeId)};
export default _sfc_main;
`);

const outDir = new URL("./_compiled/", import.meta.url);
await Deno.mkdir(outDir, { recursive: true });
const outFile = new URL("Demo.mjs", outDir);
await Deno.writeTextFile(outFile, moduleSrc);
console.log("✓ assembled module ->", outFile.pathname);

// 5. Load + SSR it.
const mod = await import(outFile.href);
const Demo = mod.default;

const app = createSSRApp(Demo, { name: "howl" });
const html = await renderToString(app);
console.log("\n--- SSR output ---");
console.log(html);
console.log("------------------\n");

// 6. Assertions.
const ok = html.includes("Hello howl") &&
  html.includes("count 41") &&
  html.includes(scopeId);
console.log(ok ? "✅ SPIKE PASSED — Vue SSR works under Deno, no Vite" : "❌ SPIKE FAILED");
if (!ok) Deno.exit(1);
