import { expect } from "@std/expect";
import { z } from "zod";
import { defineConfig } from "../../api/define-api.ts";
import { apiHandler } from "../../api/api-handler.ts";
import { memoryCache } from "../../api/cache/memory.ts";
import errors from "../../api/errors.ts";
import { json, makeApp } from "../harness.ts";

interface State {
  userContext?: { id: string; roles: string[] };
}

type Role = "USER" | "ADMIN";

function setup(opts: Partial<Parameters<typeof defineConfig<State, Role>>[0]> = {}) {
  return defineConfig<State, Role>({
    roles: ["USER", "ADMIN"],
    cache: memoryCache(),
    rateLimitCache: memoryCache(),
    ...opts,
  });
}

Deno.test("api — handler return is body verbatim, ok injected, status lifted out", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const ping = defineApi({
    name: "Ping",
    directory: "public",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ message: z.string() }) },
    handler: () => ({ statusCode: 200, message: "pong" }),
  });
  apiHandler(t.app, [ping], config);

  const res = await t.fetch("/api/public/ping");
  expect(res.status).toBe(200);
  expect(await json(res)).toEqual({ ok: true, message: "pong" });
});

Deno.test("api — handler returning { data, status } is not double-wrapped", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const list = defineApi({
    name: "List",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ data: z.array(z.number()) }) },
    handler: () => ({ data: [1, 2, 3], status: 200 }),
  });
  apiHandler(t.app, [list], config);

  const res = await t.fetch("/api/items/list");
  expect(res.status).toBe(200);
  expect(await json(res)).toEqual({ ok: true, data: [1, 2, 3] });
});

Deno.test("api — `status` and `statusCode` are both stripped from the body", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const both = defineApi({
    name: "Both",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 201: z.object({ id: z.string() }) },
    handler: () => ({ statusCode: 201, status: 999, id: "x" }),
  });
  apiHandler(t.app, [both], config);

  const res = await t.fetch("/api/items/both");
  expect(res.status).toBe(201);
  const body = await json<Record<string, unknown>>(res);
  expect(body).toEqual({ ok: true, id: "x" });
  expect(body.status).toBeUndefined();
  expect(body.statusCode).toBeUndefined();
});

Deno.test("api — protected route blocked when checkPermissionStrategy denies", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup({
    checkPermissionStrategy: (ctx, allowed) => {
      const user = ctx.state.userContext;
      if (!user) return ctx.json({ message: "Unauthorized" }, { status: 401 });
      if (!allowed.some((r) => user.roles.includes(r))) {
        return ctx.json({ message: "Forbidden" }, { status: 403 });
      }
    },
  });
  const adminOnly = defineApi({
    name: "Secret",
    directory: "admin",
    method: "GET",
    roles: ["ADMIN"],
    rateLimit: false,
    responses: { 200: z.object({ ok: z.boolean() }) },
    handler: () => ({ statusCode: 200, ok: true }),
  });
  apiHandler(t.app, [adminOnly], config);

  const anon = await t.fetch("/api/admin/secret");
  expect(anon.status).toBe(401);
});

Deno.test("api — Zod requestBody validation rejects malformed JSON", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const create = defineApi({
    name: "Create",
    directory: "items",
    method: "POST",
    roles: [],
    rateLimit: false,
    requestBody: z.object({ name: z.string().min(1) }),
    responses: { 200: z.object({ id: z.string() }) },
    handler: (ctx) => ({ statusCode: 200, id: `id-${ctx.req.body.name}` }),
  });
  apiHandler(t.app, [create], config);

  const ok = await t.fetch("/api/items/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "thing" }),
  });
  expect(ok.status).toBe(200);
  expect(await json(ok)).toEqual({ ok: true, id: "id-thing" });

  const bad = await t.fetch("/api/items/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "" }),
  });
  expect(bad.status).toBeGreaterThanOrEqual(400);
  expect(bad.status).toBeLessThan(500);
});

Deno.test("api — query schema parses values onto ctx.query()", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const search = defineApi({
    name: "Search",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    query: z.object({
      q: z.string(),
      page: z.coerce.number().default(1),
    }),
    responses: { 200: z.object({ q: z.string(), page: z.number() }) },
    handler: (ctx) => {
      const q = ctx.query();
      return { statusCode: 200, q: q.q, page: q.page };
    },
  });
  apiHandler(t.app, [search], config);

  const res = await t.fetch("/api/items/search?q=howl&page=3");
  expect(await json(res)).toEqual({ ok: true, q: "howl", page: 3 });
});

Deno.test("api — rate limit returns 429 once max exceeded", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const limited = defineApi({
    name: "Limited",
    directory: "rate",
    method: "GET",
    roles: [],
    rateLimit: { max: 2, windowMs: 60_000 },
    responses: { 200: z.object({ ok: z.boolean() }) },
    handler: () => ({ statusCode: 200, ok: true }),
  });
  apiHandler(t.app, [limited], config);

  const a = await t.fetch("/api/rate/limited");
  const b = await t.fetch("/api/rate/limited");
  const c = await t.fetch("/api/rate/limited");

  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(c.status).toBe(429);
  expect(c.headers.get("Retry-After")).not.toBeNull();
  expect(c.headers.get("X-RateLimit-Limit")).toBe("2");
});

Deno.test("api — caching short-circuits handler on second call", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  let runs = 0;
  const cached = defineApi({
    name: "Cached",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    caching: { ttl: 60 },
    responses: { 200: z.object({ runs: z.number() }) },
    handler: () => {
      runs++;
      return { statusCode: 200, runs };
    },
  });
  apiHandler(t.app, [cached], config);

  const first = await t.fetch("/api/items/cached");
  const second = await t.fetch("/api/items/cached");

  expect(await json(first)).toEqual({ ok: true, runs: 1 });
  expect(await json(second)).toEqual({ ok: true, runs: 1 });
  expect(runs).toBe(1);
});

Deno.test("api — handler can call ctx methods (cookies/json) without TypeError on private fields", async () => {
  // Regression: a previous makeApiCtx used `Object.create(ctx)`, which broke
  // `#`-private field access when handlers invoked ctx methods on the child —
  // V8 threw `Receiver must be an instance of class Context`.
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const route = defineApi({
    name: "Set Cookie",
    directory: "auth",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ token: z.string() }) },
    handler: (ctx) => {
      ctx.cookies.set("session", "abc", { httpOnly: true });
      return ctx.json({ ok: true, token: "abc" });
    },
  });
  apiHandler(t.app, [route], config);

  const res = await t.fetch("/api/auth/set-cookie");
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toContain("session=abc");
});

Deno.test("api — errors.notFound() yields 404 with structured body", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const handler = defineApi({
    name: "Boom",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ ok: z.boolean() }) },
    handler: () => {
      throw errors.notFound("missing");
    },
  });
  apiHandler(t.app, [handler], config);

  const res = await t.fetch("/api/items/boom");
  expect(res.status).toBe(404);
});

Deno.test("api — explicit `path` overrides FS-derived path", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const webhook = defineApi({
    name: "Stripe Webhook",
    directory: "webhooks",
    method: "POST",
    path: "/webhooks/stripe",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ received: z.boolean() }) },
    handler: () => ({ statusCode: 200, received: true }),
  });
  apiHandler(t.app, [webhook], config);

  const ok = await t.fetch("/webhooks/stripe", { method: "POST" });
  expect(ok.status).toBe(200);

  const wrong = await t.fetch("/api/webhooks/stripe-webhook", { method: "POST" });
  expect(wrong.status).toBe(404);
});

Deno.test("api — before hooks run in order before the handler", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const order: string[] = [];
  const route = defineApi({
    name: "Hooked",
    directory: "hooks",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ ok: z.boolean() }) },
    before: [
      () => {
        order.push("first");
      },
      async () => {
        await Promise.resolve();
        order.push("second");
      },
    ],
    handler: () => {
      order.push("handler");
      return { statusCode: 200, ok: true };
    },
  });
  apiHandler(t.app, [route], config);

  const res = await t.fetch("/api/hooks/hooked");
  expect(res.status).toBe(200);
  expect(order).toEqual(["first", "second", "handler"]);
});

Deno.test("api — before hook returning a Response short-circuits the handler", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  let handlerRan = false;
  const route = defineApi({
    name: "Gated",
    directory: "hooks",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ ok: z.boolean() }) },
    before: [
      (ctx) => ctx.json({ blocked: true }, { status: 418 }),
    ],
    handler: () => {
      handlerRan = true;
      return { statusCode: 200, ok: true };
    },
  });
  apiHandler(t.app, [route], config);

  const res = await t.fetch("/api/hooks/gated");
  expect(res.status).toBe(418);
  expect(await json(res)).toEqual({ blocked: true });
  expect(handlerRan).toBe(false);
});

Deno.test("api — after hooks receive the response and can replace it", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const seen: number[] = [];
  const route = defineApi({
    name: "Tapped",
    directory: "hooks",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ ok: z.boolean() }) },
    after: [
      (_ctx, response) => {
        seen.push(response.status);
      },
      (_ctx, response) => {
        const headers = new Headers(response.headers);
        headers.set("X-Tapped", "yes");
        return new Response(response.body, { status: response.status, headers });
      },
    ],
    handler: () => ({ statusCode: 200, ok: true }),
  });
  apiHandler(t.app, [route], config);

  const res = await t.fetch("/api/hooks/tapped");
  expect(res.status).toBe(200);
  expect(res.headers.get("X-Tapped")).toBe("yes");
  expect(seen).toEqual([200]);
  expect(await json(res)).toEqual({ ok: true });
});

Deno.test("api — after hooks run on cache hits too", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  let afterRuns = 0;
  let handlerRuns = 0;
  const route = defineApi({
    name: "Cached Hook",
    directory: "hooks",
    method: "GET",
    roles: [],
    rateLimit: false,
    caching: { ttl: 60 },
    responses: { 200: z.object({ n: z.number() }) },
    after: [
      () => {
        afterRuns++;
      },
    ],
    handler: () => {
      handlerRuns++;
      return { statusCode: 200, n: handlerRuns };
    },
  });
  apiHandler(t.app, [route], config);

  await t.fetch("/api/hooks/cached-hook");
  await t.fetch("/api/hooks/cached-hook");
  expect(handlerRuns).toBe(1);
  expect(afterRuns).toBe(2);
});

Deno.test("api — unexpected 500 hides the internal message but keeps correlationId", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const route = defineApi({
    name: "Internal Boom",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ ok: z.boolean() }) },
    handler: () => {
      throw new Error("postgres://user:hunter2@db.internal refused connection");
    },
  });
  apiHandler(t.app, [route], config);

  const res = await t.fetch("/api/items/internal-boom");
  expect(res.status).toBe(500);
  const body = await json<{ error: string; correlationId: string }>(res);
  expect(body.error).toBe("Something went wrong, try again.");
  expect(body.error).not.toContain("hunter2");
  expect(typeof body.correlationId).toBe("string");
  expect(res.headers.get("X-Howl-Correlation-Id")).toBe(body.correlationId);
});

Deno.test("api — HttpError message is still exposed to the client", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  const route = defineApi({
    name: "Named Missing",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    responses: { 200: z.object({ ok: z.boolean() }) },
    handler: () => {
      throw errors.notFound("Property not found");
    },
  });
  apiHandler(t.app, [route], config);

  const res = await t.fetch("/api/items/named-missing");
  expect(res.status).toBe(404);
  const body = await json<{ error: string }>(res);
  expect(body.error).toBe("Property not found");
});

Deno.test("api — non-2xx handler results are not cached", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  let runs = 0;
  const route = defineApi({
    name: "Flaky",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    caching: { ttl: 60 },
    responses: { 200: z.object({ ok: z.boolean() }) },
    handler: () => {
      runs++;
      if (runs === 1) return { status: 503, error: "warming up" };
      return { statusCode: 200, ok: true };
    },
  });
  apiHandler(t.app, [route], config);

  const first = await t.fetch("/api/items/flaky");
  expect(first.status).toBe(503);
  const second = await t.fetch("/api/items/flaky");
  expect(second.status).toBe(200);
  expect(runs).toBe(2);
});

Deno.test("api — cached responses replay their original status code", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup();
  let runs = 0;
  const route = defineApi({
    name: "Created",
    directory: "items",
    method: "GET",
    roles: [],
    rateLimit: false,
    caching: { ttl: 60 },
    responses: { 201: z.object({ id: z.string() }) },
    handler: () => {
      runs++;
      return { statusCode: 201, id: "abc" };
    },
  });
  apiHandler(t.app, [route], config);

  const first = await t.fetch("/api/items/created");
  const second = await t.fetch("/api/items/created");
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(await json(second)).toEqual({ ok: true, id: "abc" });
  expect(runs).toBe(1);
});

Deno.test("api — protected route skips caching when no identifier is configured", async () => {
  const t = makeApp<State>();
  const { defineApi, config } = setup({
    checkPermissionStrategy: () => {}, // allow everyone, but no identifier hook
  });
  let runs = 0;
  const route = defineApi({
    name: "Private Cached",
    directory: "admin",
    method: "GET",
    roles: ["USER"],
    rateLimit: false,
    caching: { ttl: 60 },
    responses: { 200: z.object({ n: z.number() }) },
    handler: () => {
      runs++;
      return { statusCode: 200, n: runs };
    },
  });
  apiHandler(t.app, [route], config);

  await t.fetch("/api/admin/private-cached");
  await t.fetch("/api/admin/private-cached");
  // Without getRateLimitIdentifier there is no safe per-user key — every
  // request must execute the handler instead of sharing one cache entry.
  expect(runs).toBe(2);
});
