import { expect } from "@std/expect";
import { makeApp, text } from "../harness.ts";

Deno.test("ctx.json — sets Content-Type and serialises body", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) => ctx.json({ hello: "world" }));

  const res = await t.fetch("/");
  expect(res.headers.get("Content-Type")).toContain("application/json");
  expect(await res.json()).toEqual({ hello: "world" });
});

Deno.test("ctx.text — sends raw text", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) => ctx.text("hi"));

  const res = await t.fetch("/");
  expect(await text(res)).toBe("hi");
});

Deno.test("ctx.html — sets HTML Content-Type", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) => ctx.html("<p>hi</p>"));

  const res = await t.fetch("/");
  expect(res.headers.get("Content-Type")).toContain("text/html");
  expect(await text(res)).toBe("<p>hi</p>");
});

Deno.test("ctx.redirect — defaults to 302 with Location header", async () => {
  const t = makeApp();
  t.app.get("/old", (ctx) => ctx.redirect("/new"));

  const res = await t.fetch("/old");
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toBe("/new");
});

Deno.test("ctx.redirect — preserves partial param on partial requests", async () => {
  const t = makeApp();
  t.app.get("/auth", (ctx) => ctx.redirect("/sign-in"));

  const normal = await t.fetch("/auth");
  expect(normal.headers.get("Location")).toBe("/sign-in");

  const partial = await t.fetch("/auth?howl-partial=true");
  expect(partial.headers.get("Location")).toBe("/sign-in?howl-partial=true");
});

Deno.test("ctx.redirect — appends with & when target already has query", async () => {
  const t = makeApp();
  t.app.get("/r", (ctx) => ctx.redirect("/dashboard?tab=home"));

  const partial = await t.fetch("/r?howl-partial=true");
  expect(partial.headers.get("Location")).toBe(
    "/dashboard?tab=home&howl-partial=true",
  );
});

Deno.test("ctx.redirect — places partial param before hash fragment", async () => {
  const t = makeApp();
  t.app.get("/r", (ctx) => ctx.redirect("/page#section"));

  const partial = await t.fetch("/r?howl-partial=true");
  expect(partial.headers.get("Location")).toBe(
    "/page?howl-partial=true#section",
  );
});

Deno.test("ctx.url — adopts x-forwarded-proto scheme behind a TLS proxy", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) => ctx.text(ctx.url.href));

  const res = await t.fetch("/", { headers: { "x-forwarded-proto": "https" } });
  expect(await text(res)).toBe("https://localhost/");
});

Deno.test("ctx.url — uses first proto when x-forwarded-proto is a list", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) => ctx.text(ctx.url.protocol));

  const res = await t.fetch("/", {
    headers: { "x-forwarded-proto": "https, http" },
  });
  expect(await text(res)).toBe("https:");
});

Deno.test("ctx.url — ignores a non-http(s) x-forwarded-proto value", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) => ctx.text(ctx.url.protocol));

  const res = await t.fetch("/", {
    headers: { "x-forwarded-proto": "javascript" },
  });
  expect(await text(res)).toBe("http:");
});

Deno.test("ctx.url — keeps the request scheme when no proxy header is set", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) => ctx.text(ctx.url.href));

  const res = await t.fetch("/");
  expect(await text(res)).toBe("http://localhost/");
});

Deno.test("ctx.redirect — does not double-append when target already has the param", async () => {
  const t = makeApp();
  t.app.get("/r", (ctx) => ctx.redirect("/page?howl-partial=true"));

  const partial = await t.fetch("/r?howl-partial=true");
  expect(partial.headers.get("Location")).toBe("/page?howl-partial=true");
});

Deno.test("ctx.query — single key and full object", async () => {
  const t = makeApp();
  t.app.get("/search", (ctx) => {
    return ctx.json({ q: ctx.query("q"), all: ctx.query() });
  });

  const res = await t.fetch("/search?q=howl&page=2");
  expect(await res.json()).toEqual({
    q: "howl",
    all: { q: "howl", page: "2" },
  });
});

Deno.test("ctx.cookies — get/set roundtrip via Set-Cookie", async () => {
  const t = makeApp();
  t.app.get("/login", (ctx) => {
    ctx.cookies.set("token", "abc123");
    return ctx.text("ok");
  });
  t.app.get("/me", (ctx) => ctx.json({ token: ctx.cookies.get("token") }));

  const login = await t.fetch("/login");
  const setCookie = login.headers.get("Set-Cookie") ?? "";
  expect(setCookie.startsWith("token=abc123")).toBe(true);
  expect(setCookie.includes("HttpOnly")).toBe(true);
  expect(setCookie.includes("SameSite=Strict")).toBe(true);

  await login.body?.cancel();

  const me = await t.fetch("/me", {
    headers: { Cookie: "token=abc123; other=foo" },
  });
  expect(await me.json()).toEqual({ token: "abc123" });
});

Deno.test("ctx.cookies.delete — emits Max-Age=0", async () => {
  const t = makeApp();
  t.app.get("/logout", (ctx) => {
    ctx.cookies.delete("session");
    return ctx.text("bye");
  });

  const res = await t.fetch("/logout");
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  expect(setCookie.includes("session=")).toBe(true);
  expect(setCookie.includes("Max-Age=0")).toBe(true);
});

Deno.test("ctx.cookies.all — returns parsed request cookies", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) => ctx.json(ctx.cookies.all()));

  const res = await t.fetch("/", {
    headers: { Cookie: "a=1; b=two" },
  });
  expect(await res.json()).toEqual({ a: "1", b: "two" });
});

Deno.test("ctx.sse — streams SSE-formatted frames", async () => {
  const t = makeApp();
  t.app.get("/events", (ctx) =>
    ctx.sse(async function* () {
      yield { data: "first", event: "tick", id: 1 };
      yield { data: { n: 2 }, event: "tick", id: 2 };
    }));

  const res = await t.fetch("/events");
  expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  expect(res.headers.get("Cache-Control")).toBe("no-cache");

  const body = await text(res);
  expect(body.includes("id: 1")).toBe(true);
  expect(body.includes("event: tick")).toBe(true);
  expect(body.includes("data: first")).toBe(true);
  expect(body.includes('data: {"n":2}')).toBe(true);
});
