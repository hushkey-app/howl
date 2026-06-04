import { atom } from "@hushkey/howl-react/store";

/** Demo counter atom — persists across client-nav (session-long jotai store). */
export const countAtom = atom(0);
