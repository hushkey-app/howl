import { expect } from "@std/expect";
import type { App } from "vue";
import { installRouterShim } from "../runtime/router_shim.ts";
import { toHowlRoute } from "../runtime/router.ts";

// Minimal stand-in for what Vue DevTools reads: app.config.globalProperties.
function fakeApp(): { config: { globalProperties: Record<string, unknown> } } {
  return { config: { globalProperties: {} } };
}

// deno-lint-ignore no-explicit-any
type Router = any;

Deno.test("installRouterShim — exposes $router.options.routes (what the DevTools tab reads)", () => {
  globalThis.__HOWL_ROUTES__ = [
    { pattern: "/", mode: "ssr", engine: "vue" },
    { pattern: "/about", mode: "aot", engine: "vue" },
  ];
  const app = fakeApp();
  installRouterShim(
    app as unknown as App,
    () => toHowlRoute({ url: new URL("https://x.test/"), route: "/" }),
  );

  const router = app.config.globalProperties.$router as Router;
  expect(router.options.routes.map((r: Router) => r.path)).toEqual(["/", "/about"]);
  expect(router.getRoutes().length).toBe(2);
  // Built-in tab also reads currentRoute.value — must match the active pattern.
  expect(router.currentRoute.value.path).toBe("/");
  expect(router.currentRoute.value.matched.length).toBe(1);

  delete globalThis.__HOWL_ROUTES__;
});

Deno.test("installRouterShim — resolve() matches a known path, misses otherwise", () => {
  globalThis.__HOWL_ROUTES__ = [{ pattern: "/about", mode: "ssr", engine: "vue" }];
  const app = fakeApp();
  installRouterShim(app as unknown as App, () => toHowlRoute({ url: new URL("https://x.test/") }));
  const router = app.config.globalProperties.$router as Router;

  expect(router.resolve("/about").matched.length).toBe(1);
  expect(router.resolve("/nope").matched.length).toBe(0);

  delete globalThis.__HOWL_ROUTES__;
});

Deno.test("installRouterShim — trailing-slash route still matches current ctx.route", () => {
  globalThis.__HOWL_ROUTES__ = [{ pattern: "/about", mode: "ssr", engine: "vue" }];
  const app = fakeApp();
  // ctx.route arrives as "/about/" (index route) — must still resolve to the
  // stripped "/about" record so the tab shows it as the active match.
  installRouterShim(
    app as unknown as App,
    () => toHowlRoute({ url: new URL("https://x.test/about/"), route: "/about/" }),
  );
  const router = app.config.globalProperties.$router as Router;
  expect(router.currentRoute.value.matched.length).toBe(1);

  delete globalThis.__HOWL_ROUTES__;
});
