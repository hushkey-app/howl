import { expect } from "@std/expect";
import * as path from "@std/path";
import { createElement } from "react";
import type { Context, RenderEngineRenderOptions } from "@hushkey/howl";
import { reactEngine } from "../engine.ts";

const FIXTURES = path.join(import.meta.dirname ?? ".", "fixtures");

interface CtxOverrides {
  url?: string;
  params?: Record<string, string>;
  state?: unknown;
  route?: string | null;
  isPartial?: boolean;
  error?: unknown;
  headers?: Headers;
}

/** Minimal stub of the request `Context` the engine reads from. */
function makeCtx(o: CtxOverrides = {}): Context<unknown> {
  return {
    url: new URL(o.url ?? "http://localhost/about/7"),
    params: o.params ?? { id: "7" },
    state: o.state ?? { title: "Howl" },
    route: o.route ?? "/about/:id",
    isPartial: o.isPartial ?? false,
    error: o.error ?? null,
    headers: o.headers ?? new Headers(),
    config: { basePath: "" },
  } as unknown as Context<unknown>;
}

function opts(over: Partial<RenderEngineRenderOptions>): RenderEngineRenderOptions {
  return {
    filePath: path.join(FIXTURES, "Plain.tsx"),
    data: undefined,
    headers: new Headers(),
    status: 200,
    ...over,
  } as RenderEngineRenderOptions;
}

Deno.test("reactEngine — SSRs the page with props, no chunk = no hydration", async () => {
  const res = await reactEngine().render(makeCtx(), opts({}));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  // React inserts `<!-- -->` text-boundary markers between dynamic text nodes.
  const text = html.replaceAll("<!-- -->", "");
  expect(html).toContain("<!DOCTYPE html>");
  expect(text).toContain("Plain 7"); // params.id rendered
  expect(html).toContain('<div id="howl-app">');
  // No chunkUrl → no hydration script / props payload emitted.
  expect(html).not.toContain("data-howl-react-page");
  expect(html).not.toContain("__REACT_PAGE_PROPS__");
});

Deno.test("reactEngine — emits hydration script + props payload when given a chunk", async () => {
  const res = await reactEngine().render(
    makeCtx(),
    opts({ chunkUrl: "/_howl/js/abc/page.js" }),
  );
  const html = await res.text();
  expect(html).toContain('data-chunk="/_howl/js/abc/page.js"');
  expect(html).toContain("window.__REACT_PAGE_PROPS__=");
  expect(html).toContain('"route":"/about/:id"');
  expect(html).toContain('"isPartial":false');
  expect(html).toContain('rel="modulepreload"');
});

Deno.test("reactEngine — useHead drives <title> + meta; useHowlState reads ctx.state", async () => {
  const res = await reactEngine().render(
    makeCtx({ state: { title: "FromState" } }),
    opts({ filePath: path.join(FIXTURES, "WithHead.tsx") }),
  );
  const html = await res.text();
  expect(html).toContain("<title>Fixture Title</title>");
  expect(html).toContain('content="fixture-desc"');
  // useHowlState saw ctx.state (strip React's text-boundary markers).
  expect(html.replaceAll("<!-- -->", "")).toContain("state:FromState");
});

Deno.test("reactEngine — falls back to resolveTitle when no useHead title", async () => {
  const res = await reactEngine().render(
    makeCtx({ state: { title: "MyApp" } }),
    opts({}),
  );
  const html = await res.text();
  expect(html).toContain("<title>MyApp</title>");
});

Deno.test("reactEngine — emits the AOT manifest when opts.aot is present", async () => {
  const res = await reactEngine().render(
    makeCtx(),
    opts({ aot: { "/about/:id": "/_howl/js/abc/aot.js" } }),
  );
  const html = await res.text();
  expect(html).toContain("window.__HOWL_REACT_AOT__=");
  expect(html).toContain('"/about/:id":"/_howl/js/abc/aot.js"');
});

Deno.test("reactEngine — emits __HOWL_REACT_ROUTES__ (dev only, react routes only)", async () => {
  const routes = [
    { pattern: "/", mode: "ssr" as const, engine: "react" },
    { pattern: "/about/:id", mode: "aot" as const, engine: "react" },
    { pattern: "/v", mode: "ssr" as const, engine: "vue" },
  ];
  const dev = await reactEngine().render(makeCtx(), opts({ dev: true, routes }));
  const html = await dev.text();
  expect(html).toContain("window.__HOWL_REACT_ROUTES__=");
  expect(html).toContain('"/about/:id"');
  expect(html).not.toContain('"/v"'); // vue route filtered out

  // Not emitted in production (no dev flag).
  const prod = await reactEngine().render(makeCtx(), opts({ routes }));
  expect(await prod.text()).not.toContain("__HOWL_REACT_ROUTES__");
});

Deno.test("reactEngine — merges ctx.headers (cookies append) into the response", async () => {
  const headers = new Headers();
  headers.append("set-cookie", "a=1");
  headers.append("set-cookie", "b=2");
  headers.set("x-custom", "yes");
  const res = await reactEngine().render(makeCtx({ headers }), opts({}));
  expect(res.headers.get("x-custom")).toBe("yes");
  const cookies = res.headers.getSetCookie();
  expect(cookies).toContain("a=1");
  expect(cookies).toContain("b=2");
});

Deno.test("reactEngine — renderToString renders a standalone component (notifications)", () => {
  const Email = (props: { name?: string }) =>
    createElement("h1", null, `Hello ${props.name ?? "there"}`);
  const out = reactEngine().renderToString!(Email, { name: "Leo" });
  expect(typeof out).toBe("string");
  expect((out as string).replaceAll("<!-- -->", "")).toContain("<h1>Hello Leo</h1>");
});

Deno.test("reactEngine — serializes howlAtom values into the SSR store script", async () => {
  const res = await reactEngine().render(
    makeCtx(),
    opts({
      filePath: path.join(FIXTURES, "WithStore.tsx"),
      data: { count: 5 },
      chunkUrl: "/_howl/js/abc/page.js",
    }),
  );
  const html = await res.text();
  // The atom was seeded from data via useHydrateAtoms, then snapshotted.
  expect(html.replaceAll("<!-- -->", "")).toContain("count:5");
  expect(html).toContain("window.__HOWL_REACT_STORE__=");
  expect(html).toContain('"count":5');
});

Deno.test("reactEngine — escapes U+2028/U+2029 line separators in serialized payloads", async () => {
  const LS = String.fromCharCode(0x2028); // line separator
  const PS = String.fromCharCode(0x2029); // paragraph separator
  const res = await reactEngine().render(
    makeCtx({ state: { title: `a${LS}b${PS}c` } }),
    opts({ chunkUrl: "/_howl/js/abc/page.js" }),
  );
  const html = await res.text();
  // Inside the JS script payload the separators must be escaped, never raw
  // (they're valid JSON but break JS string literals on older engines). They may
  // still appear raw as HTML text (e.g. in <title>), which is harmless.
  const script = html.match(/data-howl-react-props>([\s\S]*?)<\/script>/)?.[1] ?? "";
  expect(script).toContain("\\u2028");
  expect(script).toContain("\\u2029");
  expect(script.includes(LS)).toBe(false);
  expect(script.includes(PS)).toBe(false);
});

Deno.test("reactEngine — no store script without a client chunk to hydrate it", async () => {
  const res = await reactEngine().render(
    makeCtx(),
    opts({ filePath: path.join(FIXTURES, "WithStore.tsx"), data: { count: 9 } }),
  );
  const html = await res.text();
  expect(html.replaceAll("<!-- -->", "")).toContain("count:9"); // still SSRs
  expect(html).not.toContain("__HOWL_REACT_STORE__");
});

Deno.test("reactEngine — serialises ctx.error for an error page payload", async () => {
  const res = await reactEngine().render(
    makeCtx({ error: Object.assign(new Error("Nope"), { status: 404 }) }),
    opts({ chunkUrl: "/_howl/js/abc/err.js" }),
  );
  const html = await res.text();
  expect(html).toContain('"error":{"status":404,"message":"Nope"}');
});
