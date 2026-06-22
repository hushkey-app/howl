import { type ComponentType, createElement } from "react";
import { expect } from "@std/expect";
import { renderToString } from "../runtime/render.ts";

function Hello(props: { name: string }) {
  return createElement("p", null, `Hello ${props.name}`);
}

Deno.test("renderToString — renders a JSX element (preact-render-to-string drop-in)", () => {
  const html = renderToString(createElement(Hello, { name: "Leo" }));
  expect(html).toBe("<p>Hello Leo</p>");
});

Deno.test("renderToString — renders a component + props (ctx.renderToString parity)", () => {
  const html = renderToString(Hello as ComponentType, { name: "Leo" });
  expect(html).toBe("<p>Hello Leo</p>");
});

Deno.test("renderToString — element and component forms produce identical markup", () => {
  const fromElement = renderToString(createElement(Hello, { name: "Howl" }));
  const fromComponent = renderToString(Hello as ComponentType, { name: "Howl" });
  expect(fromElement).toBe(fromComponent);
});

Deno.test("renderToString — component with no props", () => {
  const Page: ComponentType = () => createElement("div", null, "ok");
  expect(renderToString(Page)).toBe("<div>ok</div>");
});
