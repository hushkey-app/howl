import { howlAtom, useAtomValue, useHydrateAtoms } from "../../runtime/store.ts";
import type { ReactPageProps } from "../../engine.ts";

/** Serializable atom seeded from server `data` during SSR, then read back. */
const countAtom = howlAtom("count", 0);

/** Fixture exercising `howlAtom` SSR serialization: seeds the atom from
 * `props.data.count` via `useHydrateAtoms`, so the engine's store snapshot
 * carries that value into `window.__HOWL_REACT_STORE__`. */
export default function WithStore(props: ReactPageProps<{ count?: number }>) {
  useHydrateAtoms([[countAtom, props.data?.count ?? 0]]);
  const count = useAtomValue(countAtom);
  return <span>count:{count}</span>;
}
