import { expect } from "@std/expect";
import { h } from "preact";
import type { PageProps } from "../../core/render.ts";
import { makeApp } from "../harness.ts";

Deno.test("programmatic — layout at /foo applies to GET /foo", async () => {
  const t = makeApp();

  // Root layout
  t.app.layout(
    "/",
    ({ Component }: PageProps) =>
      h("html", null, h("body", null, "root>", h(Component, null), "<")),
  );

  // Nested layout at /foo
  t.app.layout(
    "/foo",
    ({ Component }: PageProps) => h("div", null, "foo-layout>", h(Component, null), "<"),
  );

  // Programmatic index route at /foo
  t.app.route("/foo", { component: () => h("p", null, "foo-index") });

  const res = await t.fetch("/foo");
  expect(res.status).toBe(200);
  const body = await res.text();
  // Both layouts should wrap the page: root → foo-layout → foo-index
  expect(body).toContain("root>");
  expect(body).toContain("foo-layout>");
  expect(body).toContain("foo-index");
});

Deno.test("programmatic — layout at /foo applies to nested route /foo/bar", async () => {
  const t = makeApp();

  t.app.layout(
    "/foo",
    ({ Component }: PageProps) => h("div", null, "foo>", h(Component, null), "<"),
  );

  t.app.route("/foo/bar", { component: () => h("p", null, "bar-page") });

  const res = await t.fetch("/foo/bar");
  expect(res.status).toBe(200);
  const body = await res.text();
  expect(body).toContain("foo>");
  expect(body).toContain("bar-page");
});

Deno.test("programmatic — app.get('/foo') sees the /foo layout in render", async () => {
  const t = makeApp();

  t.app.layout(
    "/foo",
    ({ Component }: PageProps) => h("section", null, "wrap>", h(Component, null), "<"),
  );

  t.app.get("/foo", (ctx) => ctx.render(h("p", null, "page")));

  const res = await t.fetch("/foo");
  expect(res.status).toBe(200);
  const body = await res.text();
  expect(body).toContain("wrap>");
  expect(body).toContain("page");
});
