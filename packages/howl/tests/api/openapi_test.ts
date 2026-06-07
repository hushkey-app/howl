import { expect } from "@std/expect";
import { z } from "zod";
import { generateOpenApiSpec } from "../../api/generate-openapi.ts";
import { defineApi } from "../../api/define-api.ts";

Deno.test("openapi — info block honours title/version/description", () => {
  const spec = generateOpenApiSpec([], {
    title: "Howl",
    version: "1.2.3",
    description: "Test docs",
  });
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.info.title).toBe("Howl");
  expect(spec.info.version).toBe("1.2.3");
  expect(spec.info.description).toBe("Test docs");
});

Deno.test("openapi — public route gets `Public route` description, no security", () => {
  const ping = defineApi({
    name: "Ping",
    directory: "public",
    method: "GET",
    roles: [],
    responses: { 200: z.object({ pong: z.boolean() }) },
    handler: () => ({ statusCode: 200, pong: true }),
  });
  const spec = generateOpenApiSpec([ping]);
  const op = spec.paths!["/api/public/ping"]!.get!;
  expect(op.summary).toBe("Ping");
  expect(op.description).toContain("Public route");
  expect((op as { security?: unknown }).security).toBeUndefined();
});

Deno.test("openapi — protected route lists required roles + bearer security", () => {
  const adminOnly = defineApi({
    name: "Admin Only",
    directory: "admin",
    method: "GET",
    roles: ["ADMIN"],
    responses: { 200: z.object({ ok: z.boolean() }) },
    handler: () => ({ statusCode: 200, ok: true }),
  });
  const spec = generateOpenApiSpec([adminOnly]);
  const op = spec.paths!["/api/admin/admin-only"]!.get!;
  expect(op.description).toContain("ADMIN");
  expect(op.security).toEqual([{ bearerAuth: [] }]);
});

Deno.test("openapi — query/path schemas surface as parameters", () => {
  const search = defineApi({
    name: "Search",
    directory: "items",
    method: "GET",
    path: "/api/items/:tenant/search",
    roles: [],
    params: z.object({ tenant: z.string() }),
    query: z.object({ q: z.string(), limit: z.number().optional() }),
    responses: { 200: z.object({ ok: z.boolean() }) },
    handler: () => ({ statusCode: 200, ok: true }),
  });
  const spec = generateOpenApiSpec([search]);
  const op = spec.paths!["/api/items/{tenant}/search"]!.get!;
  const names = (op.parameters ?? []).map((p) => "name" in p ? `${p.in}:${p.name}` : null);
  expect(names).toContain("path:tenant");
  expect(names).toContain("query:q");
  expect(names).toContain("query:limit");
});

Deno.test("openapi — requestBody schema is converted from Zod", () => {
  const create = defineApi({
    name: "Create",
    directory: "items",
    method: "POST",
    roles: [],
    requestBody: z.object({ name: z.string() }),
    responses: { 200: z.object({ id: z.string() }) },
    handler: () => ({ statusCode: 200, id: "x" }),
  });
  const spec = generateOpenApiSpec([create]);
  const op = spec.paths!["/api/items/create"]!.post!;
  const body = op.requestBody as { content: Record<string, { schema: unknown }> };
  expect(body.content["application/json"].schema).toBeDefined();
});
