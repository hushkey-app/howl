import { expect } from "@std/expect";
import {
  getPathParamNames,
  hasDynamicParams,
  materializeSsgPathname,
} from "../../dev/ssg_paths.ts";

Deno.test("ssg paths — detects dynamic params", () => {
  expect(hasDynamicParams("/properties/:id")).toBe(true);
  expect(hasDynamicParams("/about")).toBe(false);
});

Deno.test("ssg paths — extracts param names in order", () => {
  expect(getPathParamNames("/orgs/:org/properties/:id")).toEqual(["org", "id"]);
});

Deno.test("ssg paths — materializes concrete pathname", () => {
  const got = materializeSsgPathname("/properties/:id", { id: "abc 123" });
  expect(got).toBe("/properties/abc%20123");
});

Deno.test("ssg paths — returns null when required params are missing", () => {
  const got = materializeSsgPathname("/properties/:id", {});
  expect(got).toBeNull();
});

Deno.test("ssg paths — returns null for optional-group patterns", () => {
  const got = materializeSsgPathname("/{:id}?", { id: "x" });
  expect(got).toBeNull();
});
