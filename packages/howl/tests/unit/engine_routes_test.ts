import { expect } from "@std/expect";
import { engineRoutesFromFiles } from "../../dev/dev_build_cache.ts";
import { CommandType } from "../../core/commands.ts";
import type { FsRouteFileNoMod } from "../../dev/dev_build_cache.ts";

// Minimal route-file stubs — engineRoutesFromFiles only reads
// type/engine/pattern/aot/ssg, so the rest is cast away.
function file(over: Partial<FsRouteFileNoMod<unknown>>): FsRouteFileNoMod<unknown> {
  return {
    type: CommandType.Route,
    pattern: "/",
    routePattern: "/",
    id: "x",
    filePath: "x",
    lazy: false,
    css: [],
    overrideConfig: undefined,
    ...over,
  } as FsRouteFileNoMod<unknown>;
}

Deno.test("engineRoutesFromFiles — tags ssr/aot/ssg and keeps the engine", () => {
  const routes = engineRoutesFromFiles([
    file({ pattern: "/", engine: "vue" }),
    file({ pattern: "/about/:id", engine: "vue", aot: true }),
    file({ pattern: "/docs", engine: "vue", ssg: true }),
    file({ pattern: "/r", engine: "react" }),
  ]);
  expect(routes).toEqual([
    { pattern: "/", engine: "vue", mode: "ssr" },
    { pattern: "/about/:id", engine: "vue", mode: "aot" },
    { pattern: "/docs", engine: "vue", mode: "ssg" },
    { pattern: "/r", engine: "react", mode: "ssr" },
  ]);
});

Deno.test("engineRoutesFromFiles — strips trailing slash on index routes, keeps root", () => {
  const routes = engineRoutesFromFiles([
    file({ pattern: "/", engine: "vue" }),
    file({ pattern: "/about/", engine: "vue" }),
    file({ pattern: "/blog/posts/", engine: "vue", aot: true }),
  ]);
  expect(routes.map((r) => r.pattern)).toEqual(["/", "/about", "/blog/posts"]);
});

Deno.test("engineRoutesFromFiles — ssg wins over aot when both set", () => {
  const routes = engineRoutesFromFiles([
    file({ pattern: "/p", engine: "vue", aot: true, ssg: true }),
  ]);
  expect(routes[0].mode).toBe("ssg");
});

Deno.test("engineRoutesFromFiles — skips non-route commands and engine-less files", () => {
  const routes = engineRoutesFromFiles([
    file({ pattern: "/layout", engine: "vue", type: CommandType.Layout }),
    file({ pattern: "/preact-page" }), // no engine → built-in, excluded
    file({ pattern: "/mw", type: CommandType.Middleware, engine: "vue" }),
  ]);
  expect(routes).toEqual([]);
});
