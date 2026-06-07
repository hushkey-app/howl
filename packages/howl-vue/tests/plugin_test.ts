import { expect } from "@std/expect";
import * as path from "@std/path";
import * as esbuild from "esbuild";
import { vuePlugin } from "../plugin.ts";

Deno.test("vuePlugin — .vue bundles to SSR JS + scoped CSS", async () => {
  const dir = await Deno.makeTempDir();
  const file = path.join(dir, "Card.vue");
  await Deno.writeTextFile(
    file,
    `<template><div class="card">{{ greeting }}</div></template>
<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ name: string }>();
const greeting = computed(() => "Hi " + props.name);
</script>
<style scoped>.card { color: red; }</style>`,
  );

  try {
    const result = await esbuild.build({
      entryPoints: [file],
      bundle: true,
      write: false,
      outdir: path.join(dir, "out"),
      format: "esm",
      external: ["vue", "vue/server-renderer"],
      plugins: [vuePlugin({ ssr: true })],
    });

    const js = result.outputFiles.find((f) => f.path.endsWith(".js"))?.text ?? "";
    const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";

    // SSR render emitted, vue kept external, scoped CSS extracted.
    expect(js).toContain("ssrRender");
    expect(js).toContain("vue/server-renderer");
    expect(css).toContain("[data-v-");
  } finally {
    await esbuild.stop();
  }
});
