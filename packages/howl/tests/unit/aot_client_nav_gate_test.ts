import { expect } from "@std/expect";
import { DOMParser } from "linkedom";
import { isClientNavOptedIn } from "../../core/runtime/shared_internal.ts";

function parseDoc(bodyInner: string) {
  // deno-lint-ignore no-explicit-any
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${bodyInner}</body></html>`,
    "text/html",
  ) as any;
}

Deno.test("aot gate — anchor inside body without client-nav is NOT opted in", () => {
  const doc = parseDoc(`<a id="t" href="/jobs">jobs</a>`);
  expect(isClientNavOptedIn(doc.querySelector("#t"))).toBe(false);
});

Deno.test("aot gate — anchor inside <body client-nav> is opted in", () => {
  const doc = parseDoc(`<a id="t" href="/jobs">jobs</a>`);
  doc.body.setAttribute("client-nav", "");
  expect(isClientNavOptedIn(doc.querySelector("#t"))).toBe(true);
});

Deno.test("aot gate — client-nav='false' explicitly opts OUT", () => {
  const doc = parseDoc(`<a id="t" href="/jobs">jobs</a>`);
  doc.body.setAttribute("client-nav", "false");
  expect(isClientNavOptedIn(doc.querySelector("#t"))).toBe(false);
});

Deno.test("aot gate — nested client-nav='false' overrides ancestor opt-in", () => {
  const doc = parseDoc(
    `<section><a id="t" href="/jobs">jobs</a></section>`,
  );
  doc.body.setAttribute("client-nav", "");
  doc.querySelector("section").setAttribute("client-nav", "false");
  expect(isClientNavOptedIn(doc.querySelector("#t"))).toBe(false);
});

Deno.test("aot gate — popstate-style check on <body> reflects its own attribute", () => {
  const optedIn = parseDoc("");
  optedIn.body.setAttribute("client-nav", "");
  expect(isClientNavOptedIn(optedIn.body)).toBe(true);
  const optedOut = parseDoc("");
  expect(isClientNavOptedIn(optedOut.body)).toBe(false);
});
