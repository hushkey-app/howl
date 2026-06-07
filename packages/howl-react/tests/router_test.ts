import { expect } from "@std/expect";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createStore, Provider as JotaiProvider } from "jotai";
import { howlLocationAtom } from "../runtime/state.ts";
import {
  back,
  EMPTY_ROUTE,
  forward,
  type HowlNavigator,
  navigate,
  type NavigateOptions,
  registerNavigator,
  toHowlRoute,
  useRoute,
} from "../runtime/router.ts";

Deno.test("toHowlRoute — maps a URL-instance props bag", () => {
  const r = toHowlRoute({
    url: new URL("https://x.test/users/7?tab=a#frag"),
    params: { id: "7" },
    query: { tab: "a" },
    route: "/users/:id",
  });
  expect(r.path).toBe("/users/7");
  expect(r.params).toEqual({ id: "7" });
  expect(r.query).toEqual({ tab: "a" });
  expect(r.hash).toBe("#frag");
  expect(r.route).toBe("/users/:id");
  expect(r.href).toBe("https://x.test/users/7?tab=a#frag");
});

Deno.test("toHowlRoute — revives a string url and derives query when absent", () => {
  const r = toHowlRoute({ url: "https://x.test/search?q=hi" });
  expect(r.path).toBe("/search");
  expect(r.query).toEqual({ q: "hi" });
  expect(r.route).toBe(null);
});

Deno.test("toHowlRoute — empty props bag yields the EMPTY_ROUTE shape", () => {
  expect(toHowlRoute({})).toEqual(EMPTY_ROUTE);
});

Deno.test("navigate — forwards URL + options to the registered navigator", () => {
  const calls: Array<{ to: string | number; opts: NavigateOptions }> = [];
  const spy: HowlNavigator = { go: (to, opts) => calls.push({ to, opts }) };
  registerNavigator(spy);

  navigate("/a");
  navigate("/b", { replace: true });
  navigate(-1);
  back();
  forward();

  expect(calls).toEqual([
    { to: "/a", opts: {} },
    { to: "/b", opts: { replace: true } },
    { to: -1, opts: {} },
    { to: -1, opts: {} },
    { to: 1, opts: {} },
  ]);
});

Deno.test("useRoute — reads the location atom reactively (per-store, no SSR leak)", () => {
  const store = createStore();
  store.set(
    howlLocationAtom,
    toHowlRoute({ url: new URL("https://x.test/p"), route: "/p" }),
  );

  function Probe() {
    const r = useRoute();
    return createElement("span", null, `${r.path}|${r.route}`);
  }
  const html = renderToString(
    createElement(JotaiProvider, { store }, createElement(Probe)),
  );
  expect(html).toContain("/p|/p");
});
