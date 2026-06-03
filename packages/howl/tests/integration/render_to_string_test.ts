import { expect } from "@std/expect";
import { h } from "preact";
import { preactEngine } from "../../core/preact_engine.ts";
import { makeApp, text } from "../harness.ts";

function Card(props: { name?: string }) {
  return h("div", { class: "card" }, `Hi ${props.name ?? "world"}`);
}

Deno.test("ctx.renderToString — renders a standalone component via the registered engine", async () => {
  const { app, fetch } = makeApp({ engines: { preact: preactEngine() } });
  app.get("/", async (ctx) => ctx.text(await ctx.renderToString(Card, { name: "Leo" })));

  const res = await fetch("/");
  expect(res.status).toBe(200);
  expect(await text(res)).toContain('<div class="card">Hi Leo</div>');
});

Deno.test("ctx.renderToString — defaults props and renders no-shell markup", async () => {
  const { app, fetch } = makeApp({ engines: { preact: preactEngine() } });
  app.get("/", async (ctx) => ctx.text(await ctx.renderToString(Card)));

  const html = await text(await fetch("/"));
  expect(html).toContain("Hi world");
  // No app/layout shell — just the component.
  expect(html).not.toContain("<html");
});

Deno.test("ctx.renderToString — throws when no engine provides it", async () => {
  const { app, fetch } = makeApp({ engines: {} }); // explicitly no engines
  app.get("/", (ctx) => {
    try {
      ctx.renderToString(Card);
      return ctx.text("no-throw");
    } catch (err) {
      return ctx.text((err as Error).message);
    }
  });

  const msg = await text(await fetch("/"));
  expect(msg).toContain("no registered render engine provides it");
});
