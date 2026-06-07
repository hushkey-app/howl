import { expect } from "@std/expect";
import { _generateAotSource } from "../../dev/plugins/aot.ts";

Deno.test("aot source — page-only chunk emits direct h(Page, props)", () => {
  const src = _generateAotSource({
    name: "aot_index",
    routePattern: "/",
    pagePath: "/abs/pages/__index.tsx",
    layouts: [],
    appPath: null,
  });

  expect(src).toContain(`import Page from`);
  expect(src).not.toContain(`import Layout`);
  expect(src).toContain(`return h(Page, props);`);
  expect(src).not.toContain(`Component: () =>`);
  expect(src).not.toContain(`PageOutlet`);
  expect(src).toContain(`export const route = "/"`);
});

Deno.test("aot source — single inner layout uses stable PageOutlet identity", () => {
  const src = _generateAotSource({
    name: "aot_dashboard",
    routePattern: "/dashboard",
    pagePath: "/abs/pages/dashboard/__index.tsx",
    layouts: ["/abs/pages/dashboard/_layout.tsx"],
    appPath: null,
  });

  expect(src).toContain(`import Layout0 from`);
  expect(src).toContain(`import Page from`);
  expect(src).toContain(`function PageOutlet()`);
  expect(src).toContain(`return h(Page, _props);`);
  expect(src).toContain(`Component: PageOutlet`);
  // No inline arrow that would churn identity per render.
  expect(src).not.toContain(`Component: () =>`);
});

Deno.test("aot source — multi-layout chunk chains stable Inner wrappers", () => {
  const src = _generateAotSource({
    name: "aot_dashboard_users",
    routePattern: "/dashboard/users",
    pagePath: "/abs/pages/dashboard/users/__index.tsx",
    layouts: [
      "/abs/pages/dashboard/_layout.tsx",
      "/abs/pages/dashboard/users/_layout.tsx",
    ],
    appPath: null,
  });

  // Three layout files → two stable wrappers (PageOutlet + Inner1).
  expect(src).toContain(`import Layout0 from`);
  expect(src).toContain(`import Layout1 from`);
  expect(src).toContain(`function PageOutlet()`);
  expect(src).toContain(`function Inner1()`);
  // Inner1 wraps Layout1 with PageOutlet as its Component.
  expect(src).toMatch(/function Inner1\(\)\s*\{[\s\S]*?Layout1[\s\S]*?Component:\s*PageOutlet/);
  // Component (outermost) wraps Layout0 with Inner1 as its Component.
  expect(src).toMatch(
    /export function Component\(props\)[\s\S]*?Layout0[\s\S]*?Component:\s*Inner1/,
  );
  expect(src).not.toContain(`Component: () =>`);
});

Deno.test("aot source — module-scoped _props slot is declared when layouts exist", () => {
  const single = _generateAotSource({
    name: "aot_x",
    routePattern: "/x",
    pagePath: "/abs/x.tsx",
    layouts: ["/abs/_layout.tsx"],
    appPath: null,
  });
  expect(single).toContain(`let _props;`);
  expect(single).toContain(`_props = props;`);
});

Deno.test("aot source — page-only chunk does NOT declare _props slot", () => {
  const pageOnly = _generateAotSource({
    name: "aot_y",
    routePattern: "/y",
    pagePath: "/abs/y.tsx",
    layouts: [],
    appPath: null,
  });
  expect(pageOnly).not.toContain(`let _props`);
});
