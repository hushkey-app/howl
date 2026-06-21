import { expect } from "@std/expect";
import { staticFiles } from "../../core/middlewares/static_files.ts";
import { makeApp } from "../harness.ts";

Deno.test("hasStaticFilesMiddleware — false when staticFiles() not registered", () => {
  const { app } = makeApp();
  app.use((ctx) => ctx.next());
  expect(app.hasStaticFilesMiddleware()).toBe(false);
});

Deno.test("hasStaticFilesMiddleware — true after app.use(staticFiles())", () => {
  const { app } = makeApp();
  app.use(staticFiles());
  expect(app.hasStaticFilesMiddleware()).toBe(true);
});

Deno.test("hasStaticFilesMiddleware — true when path-scoped", () => {
  const { app } = makeApp();
  app.use("/assets", staticFiles());
  expect(app.hasStaticFilesMiddleware()).toBe(true);
});
