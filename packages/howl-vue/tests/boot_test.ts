import { expect } from "@std/expect";
import { parseHTML } from "linkedom";
import { bootVueIslands } from "../runtime/boot.ts";

function setup(body: string) {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${body}</body></html>`);
  const calls: Array<{ component: unknown; props: Record<string, unknown>; el: unknown }> = [];
  const mount = (component: unknown, props: Record<string, unknown>, el: unknown) => {
    calls.push({ component, props, el });
  };
  const importer = (url: string) =>
    Promise.resolve({ default: { __chunk: url } as unknown as never });
  return { document, calls, mount, importer };
}

Deno.test("bootVueIslands — mounts each placeholder with parsed props", async () => {
  const { document, calls, mount, importer } = setup(
    `<div data-howl-vue="chart" data-howl-vue-props='{"n":42}'></div>
     <div data-howl-vue="clock" data-howl-vue-props='{}'></div>`,
  );

  // deno-lint-ignore no-explicit-any
  await bootVueIslands(document as any, { chart: "/c.js", clock: "/k.js" }, mount, importer);

  expect(calls.length).toBe(2);
  const chart = calls.find((c) => (c.component as { __chunk: string }).__chunk === "/c.js")!;
  expect(chart.props).toEqual({ n: 42 });
});

Deno.test("bootVueIslands — skips placeholders with no manifest entry", async () => {
  const { document, calls, mount, importer } = setup(
    `<div data-howl-vue="missing" data-howl-vue-props='{}'></div>`,
  );

  // deno-lint-ignore no-explicit-any
  await bootVueIslands(document as any, {}, mount, importer);

  expect(calls.length).toBe(0);
});
