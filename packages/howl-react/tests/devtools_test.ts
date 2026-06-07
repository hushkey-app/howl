import { expect } from "@std/expect";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createStore, Provider as JotaiProvider } from "jotai";
import { howlLocationAtom } from "../runtime/state.ts";
import { toHowlRoute } from "../runtime/router.ts";
import { buildPath, extractParams, RouteDevtoolsPanel } from "../runtime/devtools.ts";

declare global {
  var __HOWL_REACT_ROUTES__: Array<{ pattern: string; mode: string; engine: string }> | undefined;
}

function render() {
  const store = createStore();
  store.set(howlLocationAtom, toHowlRoute({ url: new URL("https://x.test/"), route: "/" }));
  return renderToString(
    createElement(JotaiProvider, { store }, createElement(RouteDevtoolsPanel)),
  );
}

Deno.test("RouteDevtoolsPanel — renders the collapsed badge without crashing", () => {
  globalThis.__HOWL_REACT_ROUTES__ = [{ pattern: "/", mode: "ssr", engine: "react" }];
  const html = render();
  expect(html).toContain("routes"); // the ⚡ routes toggle badge
  delete globalThis.__HOWL_REACT_ROUTES__;
});

Deno.test("RouteDevtoolsPanel — tolerates a missing route map", () => {
  delete globalThis.__HOWL_REACT_ROUTES__;
  expect(() => render()).not.toThrow();
});

Deno.test("extractParams — lists params, including catch-all / optional modifiers", () => {
  expect(extractParams("/about/:id")).toEqual(["id"]);
  expect(extractParams("/")).toEqual([]);
  expect(extractParams("/files/:path*")).toEqual(["path"]);
  expect(extractParams("/u/:uid/posts/:pid")).toEqual(["uid", "pid"]);
});

Deno.test("buildPath — substitutes + URL-encodes param values", () => {
  expect(buildPath("/about/:id", { id: "7" })).toBe("/about/7");
  expect(buildPath("/u/:uid/posts/:pid", { uid: "leo", pid: "42" })).toBe("/u/leo/posts/42");
  expect(buildPath("/q/:term", { term: "a b/c" })).toBe("/q/a%20b%2Fc");
});
