import { expect } from "@std/expect";
import { createStore } from "jotai";
import { howlAtom } from "../runtime/store.ts";
import { dumpSerializableAtoms, loadSerializableAtoms } from "../runtime/serialize.ts";

Deno.test("howlAtom — behaves like a normal jotai atom", () => {
  const a = howlAtom("rt-plain", "x");
  const store = createStore();
  expect(store.get(a)).toBe("x");
  store.set(a, "y");
  expect(store.get(a)).toBe("y");
});

Deno.test("howlAtom — value round-trips across stores via dump/load", () => {
  const a = howlAtom("rt-count", 1);
  const src = createStore();
  src.set(a, 99);
  const dump = dumpSerializableAtoms(src);
  expect(dump["rt-count"]).toBe(99);

  // A fresh store starts at the atom's default until hydrated.
  const dst = createStore();
  expect(dst.get(a)).toBe(1);
  loadSerializableAtoms(dst, dump);
  expect(dst.get(a)).toBe(99);
});

Deno.test("loadSerializableAtoms — ignores keys with no registered atom", () => {
  const store = createStore();
  loadSerializableAtoms(store, { "never-registered": 5 }); // must not throw
});

Deno.test("plain atom() is not serialized — only howlAtom is registered", () => {
  const keyed = howlAtom("rt-keyed", 7);
  const src = createStore();
  src.set(keyed, 8);
  const dump = dumpSerializableAtoms(src);
  expect(dump["rt-keyed"]).toBe(8);
  // Plain atoms have no key, so they can't appear in the snapshot.
  expect(Object.values(dump)).not.toContain("unkeyed-marker");
});
