import { atom } from "@hushkey/howl-react/store";

/**
 * Demo global store — a session-long "howl" count. Define an atom once at module
 * scope and read it anywhere with `useAtom`; Howl wraps the tree in a jotai
 * Provider (a fresh store per request on the server, one session store on the
 * client) so the value survives client-nav (Home ↔ Docs and back).
 */
export const howlsAtom = atom(0);
