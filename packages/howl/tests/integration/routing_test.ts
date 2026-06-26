import { expect } from "@std/expect";
import { makeApp, text } from "../harness.ts";

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

Deno.test("routing — overlapping dynamic slots resolve per method, not 405", async () => {
  const t = makeApp();
  // Same URL slot under different param names, the POST-only def registered
  // first. A GET must reach the GET def instead of 405'ing on the POST def.
  t.app.post("/api/task/:projectId", (ctx) => ctx.json({ projectId: ctx.params.projectId }));
  t.app.delete("/api/task/:id", (ctx) => ctx.json({ deleted: ctx.params.id }));
  t.app.get("/api/task/:id", (ctx) => ctx.json({ id: ctx.params.id }));

  const get = await t.fetch("/api/task/abc");
  expect(get.status).toBe(200);
  expect(await get.json()).toEqual({ id: "abc" });

  const del = await t.fetch("/api/task/abc", { method: "DELETE" });
  expect(del.status).toBe(200);
  expect(await del.json()).toEqual({ deleted: "abc" });

  const post = await t.fetch("/api/task/p-1", { method: "POST" });
  expect(post.status).toBe(200);
  expect(await post.json()).toEqual({ projectId: "p-1" });

  // A verb registered on neither def still 405s.
  const patch = await t.fetch("/api/task/abc", { method: "PATCH" });
  expect(patch.status).toBe(405);
});

Deno.test("routing — OPTIONS unions Allow across overlapping dynamic slots", async () => {
  const t = makeApp();
  t.app.post("/api/task/:projectId", (ctx) => ctx.text("c"));
  t.app.delete("/api/task/:id", (ctx) => ctx.text("d"));
  t.app.get("/api/task/:id", (ctx) => ctx.text("g"));

  const res = await t.fetch("/api/task/abc", { method: "OPTIONS" });
  expect(res.status).toBe(204);
  const allow = (res.headers.get("Allow") ?? "").split(", ").filter(Boolean).sort();
  expect(allow).toEqual(["DELETE", "GET", "POST"]);
});

Deno.test("routing — 405 response carries an Allow header (RFC 9110)", async () => {
  const t = makeApp();
  t.app.get("/r", (ctx) => ctx.text("g"));
  t.app.post("/r", (ctx) => ctx.text("p"));

  const res = await t.fetch("/r", { method: "DELETE" });
  expect(res.status).toBe(405);
  const allow = (res.headers.get("Allow") ?? "").split(", ").filter(Boolean).sort();
  expect(allow).toEqual(["GET", "POST"]);
  // Body/content-type unchanged — Allow rides alongside the plain-text 405.
  expect(await text(res)).toBe("Method Not Allowed");
  expect(res.headers.get("Content-Type")).toContain("text/plain");
});

Deno.test("routing — 405 Allow header is unioned across overlapping dynamic slots", async () => {
  const t = makeApp();
  t.app.post("/api/task/:projectId", (ctx) => ctx.text("c"));
  t.app.delete("/api/task/:id", (ctx) => ctx.text("d"));
  t.app.get("/api/task/:id", (ctx) => ctx.text("g"));

  // PATCH is on neither def → 405, but Allow must list every reachable verb.
  const res = await t.fetch("/api/task/abc", { method: "PATCH" });
  expect(res.status).toBe(405);
  const allow = (res.headers.get("Allow") ?? "").split(", ").filter(Boolean).sort();
  expect(allow).toEqual(["DELETE", "GET", "POST"]);
});

Deno.test("routing — middleware-set headers persist onto error responses", async () => {
  const t = makeApp();
  t.app.use((ctx) => {
    ctx.headers.set("X-Trace-Id", "abc");
    return ctx.next();
  });
  t.app.get("/r", (ctx) => ctx.text("g"));

  // Method mismatch throws downstream; the trace header set by middleware
  // before the throw must still reach the client.
  const res = await t.fetch("/r", { method: "POST" });
  expect(res.status).toBe(405);
  expect(res.headers.get("X-Trace-Id")).toBe("abc");
  expect(res.headers.get("Allow")).toBe("GET");
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
