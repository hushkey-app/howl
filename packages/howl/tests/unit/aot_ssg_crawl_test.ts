import { expect } from "@std/expect";
import * as path from "@std/path";
import { crawlRouteDir } from "../../dev/fs_crawl.ts";
import { fsAdapter } from "../../core/fs.ts";
import { CommandType } from "../../core/commands.ts";

async function withTempPages(
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "howl-crawl-" });
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      await Deno.mkdir(path.dirname(abs), { recursive: true });
      await Deno.writeTextFile(abs, body);
    }
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

const PAGE_STUB = `export default function P(){return null}`;

Deno.test("fs_crawl — __page.tsx is detected as AOT and prefix stripped from URL", async () => {
  await withTempPages({
    "jobs/__index.tsx": PAGE_STUB,
  }, async (dir) => {
    const files = await crawlRouteDir(fsAdapter, dir, [], () => {});
    const page = files.find((f) => f.type === CommandType.Route);
    expect(page).toBeDefined();
    expect(page!.aot).toBe(true);
    expect(page!.ssg).toBe(false);
    expect(page!.routePattern).toBe("/jobs");
  });
});

Deno.test("fs_crawl — ___page.tsx is detected as SSG (which implies AOT)", async () => {
  await withTempPages({
    "___about.tsx": PAGE_STUB,
  }, async (dir) => {
    const files = await crawlRouteDir(fsAdapter, dir, [], () => {});
    const page = files.find((f) => f.type === CommandType.Route);
    expect(page).toBeDefined();
    expect(page!.aot).toBe(true);
    expect(page!.ssg).toBe(true);
    expect(page!.routePattern).toBe("/about");
  });
});

Deno.test("fs_crawl — regular page (no prefix) is neither AOT nor SSG", async () => {
  await withTempPages({
    "index.tsx": PAGE_STUB,
  }, async (dir) => {
    const files = await crawlRouteDir(fsAdapter, dir, [], () => {});
    const page = files.find((f) => f.type === CommandType.Route);
    expect(page).toBeDefined();
    expect(page!.aot).toBe(false);
    expect(page!.ssg).toBe(false);
  });
});

Deno.test("fs_crawl — _layout.tsx is not misclassified as AOT despite leading underscores", async () => {
  await withTempPages({
    "_layout.tsx": PAGE_STUB,
    "index.tsx": PAGE_STUB,
  }, async (dir) => {
    const files = await crawlRouteDir(fsAdapter, dir, [], () => {});
    const layout = files.find((f) => f.type === CommandType.Layout);
    expect(layout).toBeDefined();
    expect(layout!.aot).toBe(false);
    expect(layout!.ssg).toBe(false);
  });
});

Deno.test("fs_crawl — AOT and SSG pages coexist with correct flags", async () => {
  await withTempPages({
    "__dashboard.tsx": PAGE_STUB,
    "___about.tsx": PAGE_STUB,
    "index.tsx": PAGE_STUB,
  }, async (dir) => {
    const files = await crawlRouteDir(fsAdapter, dir, [], () => {});
    const byPattern = new Map(files.map((f) => [f.routePattern, f]));
    expect(byPattern.get("/dashboard")!.aot).toBe(true);
    expect(byPattern.get("/dashboard")!.ssg).toBe(false);
    expect(byPattern.get("/about")!.aot).toBe(true);
    expect(byPattern.get("/about")!.ssg).toBe(true);
    expect(byPattern.get("/")!.aot).toBe(false);
    expect(byPattern.get("/")!.ssg).toBe(false);
  });
});
