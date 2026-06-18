import { expect } from "@std/expect";
import * as path from "@std/path";
import { vueEngine } from "../engine.ts";

/** Minimal `Context` stand-in for driving the engine's `render` in isolation. */
function fakeContext(url: string) {
  return {
    config: { basePath: "" },
    url: new URL(url),
    params: {},
    query: {},
    route: "/",
    isPartial: false,
    state: { client: { title: "Test" } },
    error: null,
    headers: new Headers(),
    // deno-lint-ignore no-explicit-any
  } as any;
}

/**
 * Dev SSR composition: a page that imports a child `.vue`, which imports a
 * nested `.vue`, plus a bare specifier resolved through the project import map.
 * Regression test for the "Unknown module" / unresolved-import failures that
 * broke any `.vue` page composing other components.
 */
Deno.test("vueEngine — dev SSR composes child + nested .vue and a bare import", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      path.join(dir, "deno.json"),
      JSON.stringify({ imports: { "@test/lib": "./lib.ts" } }),
    );
    await Deno.writeTextFile(
      path.join(dir, "lib.ts"),
      `export const LIB_VALUE = "lib-value-ok";`,
    );
    await Deno.writeTextFile(
      path.join(dir, "nested.vue"),
      `<template><span class="nested">nested-ok</span></template>
<style scoped>.nested { color: blue; }</style>`,
    );
    await Deno.writeTextFile(
      path.join(dir, "child.vue"),
      `<template><div class="child">child-ok <Nested /></div></template>
<script setup lang="ts">
import Nested from "./nested.vue";
</script>
<style scoped>.child { color: red; }</style>`,
    );
    const pageFile = path.join(dir, "page.vue");
    await Deno.writeTextFile(
      pageFile,
      `<template><main><Child /><p>{{ libValue }}</p></main></template>
<script setup lang="ts">
import Child from "./child.vue";
import { LIB_VALUE } from "@test/lib";
const libValue = LIB_VALUE;
</script>`,
    );

    const engine = vueEngine();
    const res = await engine.render(fakeContext("http://localhost/"), {
      filePath: pageFile,
      data: null,
      headers: new Headers(),
      status: 200,
      dev: true,
    });
    const html = await res.text();

    expect(res.status).toBe(200);
    // Whole composition rendered server-side.
    expect(html).toContain("child-ok");
    expect(html).toContain("nested-ok");
    // Bare specifier resolved through the project's deno.json import map.
    expect(html).toContain("lib-value-ok");
    // Transitive scoped CSS (child + nested) inlined into the document.
    expect(html).toContain(".child[data-v-");
    expect(html).toContain(".nested[data-v-");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
