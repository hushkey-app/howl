import { expect } from "@std/expect";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { VueIsland } from "../runtime/host.ts";

Deno.test("VueIsland — renders a marker div with name + serialised props", () => {
  const html = renderToString(
    h(VueIsland, { name: "chart", props: { points: [1, 2], label: "x" } }),
  );
  expect(html).toContain(`data-howl-vue="chart"`);
  // Props are JSON, HTML-attribute-escaped by the renderer.
  expect(html).toContain("&quot;label&quot;");
  expect(html).toContain("display:contents");
});

Deno.test("VueIsland — defaults props to empty object", () => {
  const html = renderToString(h(VueIsland, { name: "clock" }));
  expect(html).toContain(`data-howl-vue="clock"`);
  expect(html).toContain(`data-howl-vue-props="{}"`);
});

Deno.test("VueIsland — renders skeleton children as placeholder", () => {
  const html = renderToString(
    h(VueIsland, { name: "chart" }, h("span", null, "loading…")),
  );
  expect(html).toContain("loading…");
});
