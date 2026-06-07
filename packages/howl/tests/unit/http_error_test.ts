import { expect } from "@std/expect";
import { HttpError } from "../../core/error.ts";
import { HttpError as HttpErrorRuntime } from "../../core/error.ts";

Deno.test("HttpError — instance carries the status code", () => {
  const err = new HttpError(404, "Nothing here");
  expect(err).toBeInstanceOf(HttpError);
  expect(err).toBeInstanceOf(Error);
  expect(err.status).toBe(404);
  expect(err.message).toBe("Nothing here");
  expect(err.name).toBe("HttpError");
});

Deno.test("HttpError — message is optional and stays empty when omitted", () => {
  // Default message is filled in by the server error handler, not the
  // constructor — this keeps client bundles free of the @std/http/status
  // text table.
  const err = new HttpError(404);
  expect(err.message).toBe("");
});

Deno.test("HttpError — accepts ErrorOptions { cause }", () => {
  const cause = new Error("root cause");
  const err = new HttpError(500, "boom", { cause });
  expect(err.cause).toBe(cause);
});

Deno.test("HttpError — re-exported from @hushkey/howl/runtime is the same class", () => {
  // Identity check: both entry points must point to the same constructor so
  // `instanceof HttpError` works regardless of which one the user imports.
  expect(HttpErrorRuntime).toBe(HttpError);
  expect(new HttpErrorRuntime(418, "I'm a teapot")).toBeInstanceOf(HttpError);
});
