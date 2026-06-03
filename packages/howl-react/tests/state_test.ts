import { expect } from "@std/expect";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createStore, Provider as JotaiProvider } from "jotai";
import { atom, useAtomValue } from "../runtime/store.ts";
import { howlStateAtom, useHowlState } from "../runtime/state.ts";

Deno.test("store — re-exports jotai's atom/useAtomValue", () => {
  const a = atom(41);
  const store = createStore();
  expect(store.get(a)).toBe(41);
  store.set(a, 42);
  expect(store.get(a)).toBe(42);
});

Deno.test("useHowlState — reads the per-store ctx.state mirror", () => {
  const store = createStore();
  store.set(howlStateAtom, { title: "Hello", user: "leo" });

  function Probe() {
    const s = useHowlState<{ title: string; user: string }>();
    return createElement("span", null, `${s.title}/${s.user}`);
  }

  const html = renderToString(
    createElement(JotaiProvider, { store }, createElement(Probe)),
  );
  expect(html).toContain("Hello/leo");
});

Deno.test("useHowlState — isolates state across stores (no SSR leak)", () => {
  const a = createStore();
  a.set(howlStateAtom, { title: "A" });
  const b = createStore();
  b.set(howlStateAtom, { title: "B" });

  function Probe() {
    return createElement("span", null, useAtomValue(howlStateAtom).title as string);
  }
  const ha = renderToString(createElement(JotaiProvider, { store: a }, createElement(Probe)));
  const hb = renderToString(createElement(JotaiProvider, { store: b }, createElement(Probe)));
  expect(ha).toContain(">A<");
  expect(hb).toContain(">B<");
});
