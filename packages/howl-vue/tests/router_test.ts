import { expect } from "@std/expect";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import {
  back,
  createRoute,
  EMPTY_ROUTE,
  forward,
  type HowlNavigator,
  navigate,
  type NavigateOptions,
  provideRoute,
  registerNavigator,
  setRoute,
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

Deno.test("useRoute — reads the provided route; setRoute updates it in place", async () => {
  const route = createRoute({ url: new URL("https://x.test/a"), route: "/a" });
  const Probe = {
    setup() {
      const r = useRoute();
      return () => h("span", `${r.path}|${r.route}`);
    },
  };

  const app1 = createSSRApp({ render: () => h(Probe) });
  provideRoute(app1, route);
  expect(await renderToString(app1)).toContain("/a|/a");

  setRoute(route, { url: new URL("https://x.test/b"), route: "/b" });
  const app2 = createSSRApp({ render: () => h(Probe) });
  provideRoute(app2, route);
  expect(await renderToString(app2)).toContain("/b|/b");
});
