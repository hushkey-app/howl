import { expect } from "@std/expect";
import { Partial } from "../../core/runtime/shared.ts";
import { makeApp } from "../harness.ts";

Deno.test("zero-JS — page with no islands/partials/client-nav ships no <script> and no Link", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) =>
    ctx.render(
      <html>
        <head>
          <title>plain</title>
        </head>
        <body>
          <h1>hello</h1>
        </body>
      </html>,
    ));

  const res = await t.fetch("/");
  const html = await res.text();

  // No bootloader script tag
  expect(html).not.toContain("<script");
  // No modulepreload Link header
  expect(res.headers.get("Link")).toBeNull();
});

Deno.test("zero-JS — client-nav forces the runtime even without islands", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) =>
    ctx.render(
      <html>
        <head>
          <title>nav</title>
        </head>
        <body client-nav>
          <h1>hello</h1>
        </body>
      </html>,
    ));

  const res = await t.fetch("/");
  const html = await res.text();

  // Bootloader script must be present so client navigation works
  expect(html).toContain("<script");
  // Link header carries the runtime modulepreload
  expect(res.headers.get("Link")).toContain("modulepreload");
});

Deno.test("zero-JS — f-view-transition forces the runtime even without islands", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) =>
    ctx.render(
      <html>
        <head>
          <title>vt</title>
        </head>
        <body f-view-transition>
          <h1>hello</h1>
        </body>
      </html>,
    ));

  const res = await t.fetch("/");
  const html = await res.text();

  expect(html).toContain("<script");
  expect(res.headers.get("Link")).toContain("modulepreload");
});

Deno.test("zero-JS — <Partial> forces the runtime even without islands", async () => {
  const t = makeApp();
  t.app.get("/", (ctx) =>
    ctx.render(
      <html>
        <head>
          <title>p</title>
        </head>
        <body>
          <Partial name="main">
            <h1>hello</h1>
          </Partial>
        </body>
      </html>,
    ));

  const res = await t.fetch("/");
  const html = await res.text();

  expect(html).toContain("<script");
  expect(res.headers.get("Link")).toContain("modulepreload");
});
