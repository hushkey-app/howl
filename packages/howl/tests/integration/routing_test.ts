import { expect } from "@std/expect";
import { makeApp, text } from "../harness.ts";
import { getBuildCache } from "../../core/app.ts";

Deno.test("routing — GET handler responds", async () => {
  const t = makeApp();
  t.app.get("/hello", (ctx) => ctx.text("world"));

  const res = await t.fetch("/hello");
  expect(res.status).toBe(200);
  expect(await text(res)).toBe("world");
});

Deno.test("routing — verb mismatch returns 405", async () => {
  const t = makeApp();
  t.app.get("/only-get", (ctx) => ctx.text("ok"));

  const res = await t.fetch("/only-get", { method: "POST" });
  expect(res.status).toBe(405);
});

Deno.test("routing — unknown path returns 404", async () => {
  const t = makeApp();
  t.app.get("/exists", (ctx) => ctx.text("ok"));

  const res = await t.fetch("/missing");
  expect(res.status).toBe(404);
});

Deno.test("routing — SSG cache uses concrete pathname for dynamic routes", async () => {
  const t = makeApp();
  const cache = getBuildCache(t.app)!;
  cache.ssgPages.set("/properties/abc", "<p>static abc</p>");

  t.app.get("/properties/:id", (ctx) => ctx.text(`dynamic ${ctx.params.id}`));

  const hit = await t.fetch("/properties/abc");
  expect(hit.status).toBe(200);
  expect(await text(hit)).toBe("<p>static abc</p>");

  const miss = await t.fetch("/properties/def");
  expect(miss.status).toBe(200);
  expect(await text(miss)).toBe("dynamic def");
});

Deno.test("routing — path params decode into ctx.params", async () => {
  const t = makeApp();
  t.app.get("/users/:id", (ctx) => ctx.json({ id: ctx.params.id }));

  const res = await t.fetch("/users/abc%20123");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: "abc 123" });
});

Deno.test("routing — wildcard segments capture multiple parts", async () => {
  const t = makeApp();
  t.app.get("/files/*", (ctx) => ctx.text(ctx.url.pathname));

  const res = await t.fetch("/files/a/b/c");
  expect(res.status).toBe(200);
  expect(await text(res)).toBe("/files/a/b/c");
});

Deno.test("routing — OPTIONS returns Allow with registered methods", async () => {
  const t = makeApp();
  t.app.get("/r", (ctx) => ctx.text("g"));
  t.app.post("/r", (ctx) => ctx.text("p"));

  const res = await t.fetch("/r", { method: "OPTIONS" });
  expect(res.status).toBe(204);
  const allow = res.headers.get("Allow") ?? "";
  expect(allow.includes("GET")).toBe(true);
  expect(allow.includes("POST")).toBe(true);
});

Deno.test("routing — HEAD reuses GET handler with empty body", async () => {
  const t = makeApp();
  t.app.get("/page", (ctx) => ctx.text("body"));

  const res = await t.fetch("/page", { method: "HEAD" });
  expect(res.status).toBe(200);
  expect(await text(res)).toBe("");
});

Deno.test("routing — basePath prefixes every route", async () => {
  const t = makeApp({ basePath: "/api" });
  t.app.get("/ping", (ctx) => ctx.text("pong"));

  const hit = await t.fetch("/api/ping");
  expect(hit.status).toBe(200);
  expect(await text(hit)).toBe("pong");

  const miss = await t.fetch("/ping");
  expect(miss.status).toBe(404);
});
