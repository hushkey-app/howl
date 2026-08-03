import { expect } from "@std/expect";
import * as path from "@std/path";
import { classifyDevChange, type DevWatchDirs, DevWatcher } from "../../dev/watcher.ts";

const ROOT = path.resolve("/projects/app");
const DIRS: DevWatchDirs = {
  outDir: path.join(ROOT, "dist"),
  clientDir: path.join(ROOT, "client"),
  staticDir: path.join(ROOT, "static"),
  apiDir: path.join(ROOT, "server", "apis"),
};

const at = (...segments: string[]) => path.join(ROOT, ...segments);

Deno.test("classifyDevChange — client-tree files the runtime cannot import hot reload", () => {
  expect(classifyDevChange(at("client", "pages", "index.vue"), DIRS)).toBe("client");
  expect(classifyDevChange(at("client", "styles", "app.css"), DIRS)).toBe("client");
  expect(classifyDevChange(at("client", "pages", "hero.svg"), DIRS)).toBe("client");
});

Deno.test("classifyDevChange — client-tree modules the runtime imported need a restart", () => {
  // The module cache pins the copy that server-rendered the page, so a hot
  // rebuild would leave SSR output behind the bundle that hydrates it.
  expect(classifyDevChange(at("client", "components", "watch.tsx"), DIRS)).toBe("restart");
  expect(classifyDevChange(at("client", "lib", "utils.ts"), DIRS)).toBe("restart");
  expect(classifyDevChange(at("client", "store", "index.store.mts"), DIRS)).toBe("restart");
  expect(classifyDevChange(at("client", "pages", "legacy.jsx"), DIRS)).toBe("restart");
});

Deno.test("classifyDevChange — static, api and server code are separated", () => {
  expect(classifyDevChange(at("static", "style.css"), DIRS)).toBe("static");
  expect(classifyDevChange(at("server", "apis", "sessions", "create.api.ts"), DIRS)).toBe("api");
  // Server code outside apis/ belongs to the runtime's own watcher.
  expect(classifyDevChange(at("server", "services", "sessions.ts"), DIRS)).toBe("ignored");
  expect(classifyDevChange(at("howl.config.ts"), DIRS)).toBe("ignored");
});

Deno.test("classifyDevChange — build output never counts as a source change", () => {
  // The bundler writes its page wrappers here; treating them as input would
  // make every rebuild trigger another one.
  expect(classifyDevChange(at("dist", ".vue-pages", "vuepage__.ts"), DIRS)).toBe("ignored");
  expect(classifyDevChange(at("dist", "static", "chunk.js"), DIRS)).toBe("ignored");
});

Deno.test("classifyDevChange — dependencies and editor droppings are ignored", () => {
  expect(classifyDevChange(at("client", "node_modules", "x", "index.js"), DIRS)).toBe("ignored");
  expect(classifyDevChange(at("client", "pages", ".index.vue.swp"), DIRS)).toBe("ignored");
  expect(classifyDevChange(at("client", "pages", "index.vue~"), DIRS)).toBe("ignored");
  expect(classifyDevChange(at("client", "pages", "index.vue.tmp"), DIRS)).toBe("ignored");
});

Deno.test("classifyDevChange — a static dir nested in the client tree stays static", () => {
  const nested: DevWatchDirs = {
    ...DIRS,
    staticDir: path.join(ROOT, "client", "static"),
  };
  expect(classifyDevChange(at("client", "static", "logo.svg"), nested)).toBe("static");
  expect(classifyDevChange(at("client", "pages", "index.vue"), nested)).toBe("client");
  // A `.ts` under the static dir is an asset, not a module the runtime loaded.
  expect(classifyDevChange(at("client", "static", "sw.ts"), nested)).toBe("static");
});

Deno.test("classifyDevChange — a directory is not inside itself", () => {
  expect(classifyDevChange(DIRS.clientDir, DIRS)).toBe("ignored");
});

Deno.test("DevWatcher — start() reports false when no directory exists", async () => {
  const watcher = new DevWatcher([path.join(ROOT, "nope")], () => Promise.resolve());
  expect(watcher.start()).toBe(false);
  await watcher.close();
});

Deno.test("DevWatcher — coalesces a burst of writes into one batch", async () => {
  const dir = await Deno.makeTempDir({ prefix: "howl-watch-" });
  const batches: string[][] = [];
  const seen = Promise.withResolvers<void>();
  const watcher = new DevWatcher([dir], (paths) => {
    batches.push(paths);
    seen.resolve();
    return Promise.resolve();
  }, 20);

  try {
    expect(watcher.start()).toBe(true);
    for (const name of ["a.ts", "b.ts", "c.ts"]) {
      await Deno.writeTextFile(path.join(dir, name), "export {};");
    }
    await seen.promise;

    expect(batches.length).toBe(1);
    // The batch may also carry the directory itself, depending on what the
    // platform reports — what matters is that one batch covers all three files.
    const touched = new Set(batches[0].map((p) => path.basename(p)));
    for (const name of ["a.ts", "b.ts", "c.ts"]) {
      expect(touched.has(name)).toBe(true);
    }
  } finally {
    await watcher.close();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("DevWatcher — a change during a batch is picked up by the next one", async () => {
  const dir = await Deno.makeTempDir({ prefix: "howl-watch-" });
  const batches: string[][] = [];
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  // Holds the first batch open so the next write lands mid-run.
  const gate = Promise.withResolvers<void>();

  const watcher = new DevWatcher([dir], async (paths) => {
    batches.push(paths);
    if (batches.length === 1) {
      first.resolve();
      await gate.promise;
    } else {
      second.resolve();
    }
  }, 10);

  try {
    expect(watcher.start()).toBe(true);
    await Deno.writeTextFile(path.join(dir, "first.ts"), "export {};");
    await first.promise;

    await Deno.writeTextFile(path.join(dir, "second.ts"), "export {};");
    // Give the watcher time to enqueue while the first batch is still running.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(batches.length).toBe(1);

    gate.resolve();
    await second.promise;
    expect(batches.length).toBe(2);
    expect(batches[1].some((p) => p.endsWith("second.ts"))).toBe(true);
  } finally {
    gate.resolve();
    await watcher.close();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("DevWatcher — close() stops delivering batches", async () => {
  const dir = await Deno.makeTempDir({ prefix: "howl-watch-" });
  let calls = 0;
  const watcher = new DevWatcher([dir], () => {
    calls++;
    return Promise.resolve();
  }, 10);

  try {
    expect(watcher.start()).toBe(true);
    await watcher.close();
    await Deno.writeTextFile(path.join(dir, "after.ts"), "export {};");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls).toBe(0);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
