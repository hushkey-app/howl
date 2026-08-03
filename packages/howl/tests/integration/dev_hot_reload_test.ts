import { expect } from "@std/expect";
import * as path from "@std/path";
import { devInvalidateHandler, Howl } from "../../core/app.ts";
import { defineConfig } from "../../api/define-api.ts";
import { memoryCache } from "../../api/cache/memory.ts";
import { HowlBuilder } from "../../dev/howl_builder.ts";

type Role = "USER";

function apiConfig() {
  return defineConfig<Record<string, never>, Role>({
    roles: ["USER"],
    cache: memoryCache(),
    rateLimitCache: memoryCache(),
  });
}

/**
 * An API definition with no imports — the file is written outside the workspace,
 * so anything it imported would have no import map to resolve against.
 */
function apiSource(body: string): string {
  return `export default {
  name: "Ping",
  directory: "hot",
  method: "GET",
  roles: [],
  rateLimit: false,
  responses: {},
  handler: () => ({ statusCode: 200, message: ${JSON.stringify(body)} }),
};
`;
}

async function withProject(
  fn: (ctx: { root: string; apisDir: string; serverEntry: string }) => Promise<void>,
): Promise<void> {
  const root = await Deno.makeTempDir({ prefix: "howl-hot-" });
  const apisDir = path.join(root, "server", "apis", "hot");
  await Deno.mkdir(apisDir, { recursive: true });
  try {
    await fn({ root, apisDir, serverEntry: path.join(root, "server", "main.ts") });
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("dev hot reload — an edited .api.ts is re-imported without restarting", async () => {
  await withProject(async ({ root, apisDir, serverEntry }) => {
    const file = path.join(apisDir, "ping.api.ts");
    await Deno.writeTextFile(file, apiSource("v1"));

    const { config } = apiConfig();
    const app = new Howl().fsApiRoutes(config);
    const builder = new HowlBuilder(app, { root, serverEntry });

    await builder.reloadApis(app);
    let handler = app.handler();
    let res = await handler(new Request("http://localhost/api/hot/ping"));
    expect(await res.json()).toEqual({ ok: true, message: "v1" });

    // Same path, new body — the module cache would otherwise hand back the
    // copy already imported and the edit would never be visible.
    await Deno.writeTextFile(file, apiSource("v2"));
    expect(await builder.reloadApis(app)).toBe(true);

    devInvalidateHandler(app);
    handler = app.handler();
    res = await handler(new Request("http://localhost/api/hot/ping"));
    expect(await res.json()).toEqual({ ok: true, message: "v2" });
  });
});

Deno.test("dev hot reload — a newly created .api.ts becomes routable", async () => {
  await withProject(async ({ root, apisDir, serverEntry }) => {
    await Deno.writeTextFile(path.join(apisDir, "ping.api.ts"), apiSource("v1"));

    const { config } = apiConfig();
    const app = new Howl().fsApiRoutes(config);
    const builder = new HowlBuilder(app, { root, serverEntry });

    await builder.reloadApis(app);
    let handler = app.handler();
    expect((await handler(new Request("http://localhost/api/hot/later"))).status).toBe(404);

    await Deno.writeTextFile(path.join(apisDir, "later.api.ts"), apiSource("added"));
    await builder.reloadApis(app);

    devInvalidateHandler(app);
    handler = app.handler();
    const res = await handler(new Request("http://localhost/api/hot/later"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: "added" });
  });
});

Deno.test("dev hot reload — a deleted .api.ts stops routing", async () => {
  await withProject(async ({ root, apisDir, serverEntry }) => {
    const file = path.join(apisDir, "ping.api.ts");
    await Deno.writeTextFile(file, apiSource("v1"));

    const { config } = apiConfig();
    const app = new Howl().fsApiRoutes(config);
    const builder = new HowlBuilder(app, { root, serverEntry });

    await builder.reloadApis(app);
    let handler = app.handler();
    expect((await handler(new Request("http://localhost/api/hot/ping"))).status).toBe(200);

    await Deno.remove(file);
    await builder.reloadApis(app);

    devInvalidateHandler(app);
    handler = app.handler();
    expect((await handler(new Request("http://localhost/api/hot/ping"))).status).toBe(404);
  });
});

Deno.test("dev hot reload — reloadApis is a no-op when the app has no fs API routes", async () => {
  await withProject(async ({ root, serverEntry }) => {
    const app = new Howl();
    const builder = new HowlBuilder(app, { root, serverEntry });
    expect(await builder.reloadApis(app)).toBe(false);
  });
});

Deno.test("dev hot reload — devInvalidateHandler lets routes be registered again", async () => {
  const app = new Howl();
  app.get("/first", (ctx) => ctx.text("first"));

  let handler = app.handler();
  expect((await handler(new Request("http://localhost/second"))).status).toBe(404);
  // The app is frozen once its handler exists — registering would throw.
  expect(() => app.get("/second", (ctx) => ctx.text("second"))).toThrow();

  devInvalidateHandler(app);
  app.get("/second", (ctx) => ctx.text("second"));
  handler = app.handler();

  expect(await (await handler(new Request("http://localhost/second"))).text()).toBe("second");
  expect(await (await handler(new Request("http://localhost/first"))).text()).toBe("first");
});
