/**
 * SSR serialization for jotai atoms — the registry + helpers behind
 * {@linkcode howlAtom}. Kept separate from the lightweight `store.ts`
 * re-export entry so a page importing the public jotai helpers doesn't drag
 * jotai's full type graph through that module.
 */
import { atom, type Atom, type PrimitiveAtom } from "jotai";

/**
 * Registry of SSR-serializable atoms keyed by their stable id, populated as
 * {@linkcode howlAtom} calls run at module load. The engine reads it to
 * serialize each atom's value on SSR; the boot runtime reads it to hydrate them
 * before first paint. Internal — prefer `howlAtom` over touching this directly.
 */
export const SERIALIZABLE_ATOMS: Map<string, PrimitiveAtom<unknown>> = new Map();

/** Minimal jotai store surface used to (de)serialize atoms across SSR. */
export interface AtomStore {
  /** Read an atom's current value. */
  get(atom: Atom<unknown>): unknown;
  /** Write a value into a writable atom. */
  set(atom: PrimitiveAtom<unknown>, value: unknown): void;
}

/**
 * Like jotai's `atom`, but registered under a stable `key` so its value
 * round-trips across SSR→client hydration — the jotai analogue of a named Pinia
 * store (`defineStore("main", …)`). Plain `atom()` stays client-only; only
 * `howlAtom()` atoms are serialized into the SSR HTML and rehydrated on the
 * client before first paint, so a reload restores their server-rendered value
 * with no hydration flash.
 *
 * ```ts
 * // store/index.store.ts
 * import { howlAtom } from "@hushkey/howl-react/store";
 * export const countAtom = howlAtom("count", 0);
 * ```
 *
 * Seed a value from server data during SSR with `useHydrateAtoms`; the
 * serializer then carries that value to the client.
 *
 * @param key Stable id, unique across the app (collisions clobber on hydrate).
 * @param initialValue The atom's initial value.
 */
export function howlAtom<Value>(key: string, initialValue: Value): PrimitiveAtom<Value> {
  const a = atom(initialValue);
  a.debugLabel = key;
  const existing = SERIALIZABLE_ATOMS.get(key);
  if (existing !== undefined && existing !== a) {
    // deno-lint-ignore no-console
    console.warn(`[howl-react] duplicate howlAtom key "${key}" — last one wins on hydrate.`);
  }
  SERIALIZABLE_ATOMS.set(key, a as PrimitiveAtom<unknown>);
  return a;
}

/**
 * Snapshot every registered {@linkcode howlAtom}'s value from `store` into a
 * plain `{ key: value }` object for SSR serialization. Returns an empty object
 * when no serializable atoms are registered.
 */
export function dumpSerializableAtoms(store: AtomStore): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, a] of SERIALIZABLE_ATOMS) out[key] = store.get(a);
  return out;
}

/**
 * Hydrate registered {@linkcode howlAtom}s in `store` from a serialized
 * `{ key: value }` snapshot. Unknown keys (atoms not yet imported) are skipped.
 */
export function loadSerializableAtoms(store: AtomStore, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    const a = SERIALIZABLE_ATOMS.get(key);
    if (a !== undefined) store.set(a, value);
  }
}
