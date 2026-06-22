import { type ComponentType, createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { expect } from "@std/expect";
import { composeReactTree } from "../runtime/compose.ts";

/** Extract the layout element and its `Component` (outlet) prop from a composed tree. */
function layoutOutlet(tree: ReactElement): unknown {
  const layoutEl = (tree.props as { children: ReactElement }).children;
  return (layoutEl.props as { Component: unknown }).Component;
}

Deno.test("composeReactTree — outlet identity is stable across calls (no remount on nav)", () => {
  const Layout: ComponentType = () => null;
  const Page: ComponentType = () => null;

  const a = composeReactTree([Layout, Page], {}) as ReactElement;
  const b = composeReactTree([Layout, Page], {}) as ReactElement;

  const outletA = layoutOutlet(a);
  const outletB = layoutOutlet(b);

  // The regression guard: a fresh `() => child` closure per call would make these
  // differ, changing the layout's `<Component/>` element type and remounting the
  // subtree below it on every client navigation. A shared module-level `Outlet`
  // keeps the identity stable so React reconciles instead.
  expect(typeof outletA).toBe("function");
  expect(outletA).toBe(outletB);
});

Deno.test("composeReactTree — outlet renders the nested child through the layout", () => {
  const Layout: ComponentType<{ Component: ComponentType }> = (props) =>
    createElement("div", { id: "layout" }, createElement(props.Component));
  const Page: ComponentType = () => createElement("p", null, "page-content");

  const html = renderToString(composeReactTree([Layout, Page], {}));

  expect(html).toContain('id="layout"');
  expect(html).toContain("page-content");
});

Deno.test("composeReactTree — nested layouts render in chain order", () => {
  const Outer: ComponentType<{ Component: ComponentType }> = (props) =>
    createElement("div", { id: "outer" }, createElement(props.Component));
  const Inner: ComponentType<{ Component: ComponentType }> = (props) =>
    createElement("section", { id: "inner" }, createElement(props.Component));
  const Page: ComponentType = () => createElement("p", null, "leaf");

  const html = renderToString(composeReactTree([Outer, Inner, Page], {}));

  expect(html).toContain('id="outer"');
  expect(html).toContain('id="inner"');
  expect(html).toContain("leaf");
  // Outer wraps Inner wraps Page.
  expect(html.indexOf("outer")).toBeLessThan(html.indexOf("inner"));
  expect(html.indexOf("inner")).toBeLessThan(html.indexOf("leaf"));
});

Deno.test("composeReactTree — single component returns the page directly (no wrapper)", () => {
  const Page: ComponentType = () => createElement("p", null, "solo");

  const tree = composeReactTree([Page], {}) as ReactElement;

  expect(tree.type).toBe(Page);
  expect(renderToString(tree)).toContain("solo");
});
