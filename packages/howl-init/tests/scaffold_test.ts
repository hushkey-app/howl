import { expect } from "@std/expect";
import { join } from "@std/path";
import { scaffold } from "../src/scaffold.ts";
import { buildProjectFiles } from "../src/blueprint/mod.ts";
import type { ProjectSpec } from "../src/spec.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "howl-init-test-" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return false;
    throw err;
  }
}

const BACKEND: ProjectSpec = { name: "be", appType: "backend", ui: "none", service: "none" };

Deno.test("buildProjectFiles — backend base has core files, no client/tailwind", () => {
  const files = buildProjectFiles(BACKEND);
  expect(files.has("deno.json")).toBe(true);
  expect(files.has("dev.ts")).toBe(true);
  expect(files.has("server/main.ts")).toBe(true);
  expect(files.has("howl.config.ts")).toBe(true);
  expect(files.has("server/apis/public/ping.api.ts")).toBe(true);
  expect(files.has(".gitignore")).toBe(true);
  expect(files.has(".env.example")).toBe(true);
  expect(files.has("README.md")).toBe(true);
  expect(files.has("tailwind.config.ts")).toBe(false);
  expect([...files.keys()].some((k) => k.startsWith("client/"))).toBe(false);

  const deno = files.get("deno.json")!;
  expect(JSON.parse(deno).tasks.compile).toContain("dist/bin/be");
  expect(deno).not.toContain("tailwindcss");
  expect(deno).not.toContain("howl-react");
  expect(deno).not.toContain("howl-vue");
  expect(files.get("dev.ts")).toContain("httpClientGenPlugin");
});

Deno.test("buildProjectFiles — fullstack-react + shadcn vendors components + deps", () => {
  const spec: ProjectSpec = {
    name: "rx",
    appType: "fullstack-react",
    ui: "shadcn",
    service: "none",
  };
  const files = buildProjectFiles(spec);
  expect(files.has("client/pages/_app.tsx")).toBe(true);
  expect(files.has("client/pages/index.tsx")).toBe(true);
  expect(files.has("client/lib/utils.ts")).toBe(true);
  expect(files.has("client/components/ui/button.tsx")).toBe(true);
  expect(files.has("client/components/ui/card.tsx")).toBe(true);
  expect(files.has("static/style.css")).toBe(true);

  const deno = files.get("deno.json")!;
  expect(deno).toContain("@hushkey/howl-react");
  expect(deno).toContain("class-variance-authority");
  expect(deno).toContain('"@/": "./client/"');
  expect(deno).toContain('"jsxImportSource": "react"');

  expect(files.get("dev.ts")).toContain("reactPlugin()");
  expect(files.get("dev.ts")).toContain("tailwindPlugin");
  expect(files.get("server/main.ts")).toContain("reactEngine()");
  expect(files.get("server/main.ts")).toContain("app.fsClientRoutes()");
  expect(files.get("static/style.css")).toContain("--background");
});

Deno.test("buildProjectFiles — fullstack-react + daisyui adds daisyui, no shadcn comps", () => {
  const spec: ProjectSpec = {
    name: "rx",
    appType: "fullstack-react",
    ui: "daisyui",
    service: "none",
  };
  const files = buildProjectFiles(spec);
  expect(files.get("deno.json")).toContain("daisyui");
  expect(files.get("deno.json")).not.toContain("class-variance-authority");
  expect(files.has("client/components/ui/button.tsx")).toBe(false);
  expect(files.get("static/style.css")).toContain('@plugin "daisyui"');
});

Deno.test("buildProjectFiles — fullstack-vue emits .vue pages + vue deps", () => {
  const spec: ProjectSpec = {
    name: "vx",
    appType: "fullstack-vue",
    ui: "daisyui",
    service: "none",
  };
  const files = buildProjectFiles(spec);
  expect(files.has("client/pages/_app.vue")).toBe(true);
  expect(files.has("client/pages/index.vue")).toBe(true);
  expect(files.has("client/howl-vue.d.ts")).toBe(true);
  const deno = files.get("deno.json")!;
  expect(deno).toContain("@hushkey/howl-vue");
  expect(deno).toContain('"vue":');
  expect(deno).toContain('"jsxImportSource": "vue"');
  expect(files.get("dev.ts")).toContain("vuePlugin()");
  expect(files.get("server/main.ts")).toContain("vueEngine()");
});

Deno.test("buildProjectFiles — service layer adds connection, service, studio, deps", () => {
  for (const service of ["sqlite", "postgres", "mongo"] as const) {
    const spec: ProjectSpec = { name: "svc", appType: "backend", ui: "none", service };
    const files = buildProjectFiles(spec);
    expect(files.has("server/services/connections.ts")).toBe(true);
    expect(files.has("server/services/items/items.schema.ts")).toBe(true);
    expect(files.has("server/services/items/items.service.ts")).toBe(true);
    expect(files.get("server/main.ts")).toContain("studio(");
    const deno = files.get("deno.json")!;
    expect(deno).toContain("@hushkey/service-core");
    expect(deno).toContain("@hushkey/studio");
  }

  expect(
    buildProjectFiles({ name: "p", appType: "backend", ui: "none", service: "postgres" })
      .get("deno.json"),
  ).toContain("@electric-sql/pglite");
  expect(
    buildProjectFiles({ name: "m", appType: "backend", ui: "none", service: "mongo" })
      .get("deno.json"),
  ).toContain("mongodb");
  expect(
    buildProjectFiles({ name: "s", appType: "backend", ui: "none", service: "sqlite" })
      .get("server/services/connections.ts"),
  ).toContain("node:sqlite");
});

Deno.test("scaffold writes the composed files to disk", async () => {
  await withTempDir(async (dir) => {
    const target = join(dir, "app");
    await scaffold({
      spec: { name: "app", appType: "fullstack-react", ui: "shadcn", service: "sqlite" },
      targetDir: target,
    });
    expect(await exists(join(target, "deno.json"))).toBe(true);
    expect(await exists(join(target, "client/components/ui/card.tsx"))).toBe(true);
    expect(await exists(join(target, "server/services/items/items.service.ts"))).toBe(true);

    const deno = await Deno.readTextFile(join(target, "deno.json"));
    expect(JSON.parse(deno).tasks.compile).toContain("dist/bin/app");
  });
});

Deno.test("scaffold refuses a non-empty target directory", async () => {
  await withTempDir(async (dir) => {
    const target = join(dir, "occupied");
    await Deno.mkdir(target);
    await Deno.writeTextFile(join(target, "leftover.txt"), "hi");
    await expect(scaffold({ spec: BACKEND, targetDir: target })).rejects.toThrow(/not empty/);
  });
});

Deno.test("scaffold succeeds when target dir exists but is empty", async () => {
  await withTempDir(async (dir) => {
    const target = join(dir, "empty");
    await Deno.mkdir(target);
    await scaffold({ spec: { ...BACKEND, name: "empty" }, targetDir: target });
    expect(await exists(join(target, "server/main.ts"))).toBe(true);
  });
});

Deno.test("every generated deno.json is valid JSON across the matrix", () => {
  const types = ["backend", "fullstack-react", "fullstack-vue"] as const;
  const services = ["none", "sqlite", "postgres", "mongo"] as const;
  for (const appType of types) {
    const uis = appType === "fullstack-react"
      ? (["shadcn", "daisyui", "tailwind"] as const)
      : appType === "fullstack-vue"
      ? (["daisyui", "tailwind"] as const)
      : (["none"] as const);
    for (const ui of uis) {
      for (const service of services) {
        const files = buildProjectFiles({ name: "matrix", appType, ui, service });
        expect(() => JSON.parse(files.get("deno.json")!)).not.toThrow();
      }
    }
  }
});

Deno.test("buildProjectFiles — AGENTS.md + CLAUDE.md, tailored per spec", () => {
  // Backend: API guidance only — no pages or service sections.
  const be = buildProjectFiles(BACKEND);
  expect(be.has("AGENTS.md")).toBe(true);
  expect(be.has("CLAUDE.md")).toBe(true);
  expect(be.get("CLAUDE.md")).toContain("AGENTS.md");
  const beGuide = be.get("AGENTS.md")!;
  expect(beGuide).toContain("Add an API route");
  expect(beGuide).toContain("directory");
  expect(beGuide).not.toContain("## Pages");
  expect(beGuide).not.toContain("## Add a service");

  // Vue fullstack + mongo: Vue-flavoured pages section, Mongo service section.
  const vx = buildProjectFiles({
    name: "vx",
    appType: "fullstack-vue",
    ui: "daisyui",
    service: "mongo",
  });
  const vxGuide = vx.get("AGENTS.md")!;
  expect(vxGuide).toContain("## Pages");
  expect(vxGuide).toContain("VuePageProps");
  expect(vxGuide).toContain("@hushkey/howl-vue/head");
  expect(vxGuide).toContain("## Add a service");
  expect(vxGuide).toContain("MongoService");

  // React fullstack + sqlite: React props, Sqlite service.
  const rx = buildProjectFiles({
    name: "rx",
    appType: "fullstack-react",
    ui: "shadcn",
    service: "sqlite",
  });
  const rxGuide = rx.get("AGENTS.md")!;
  expect(rxGuide).toContain("ReactPageProps");
  expect(rxGuide).toContain("SqliteService");
});
