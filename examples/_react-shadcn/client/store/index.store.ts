import { howlAtom } from "@hushkey/howl-react/store";

/** Demo counter atom — persists across client-nav (session-long jotai store)
 * and survives a full reload: `howlAtom` serializes its value on SSR and
 * rehydrates it on the client before first paint. */
export const countAtom = howlAtom("count", 0);
