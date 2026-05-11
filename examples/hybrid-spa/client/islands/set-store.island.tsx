import { useEffect } from "preact/hooks";
import type { State } from "../../howl.config.ts";

/**
 * Reproduces the hushkey pattern: an island sitting inside `<Partial>` that
 * useEffect-syncs `state` into a global store.
 *
 * Bug: useEffect depends on object refs (`state`, `userContext`) — new
 * reference every render → effect re-fires N times per navigation.
 *
 * Open the browser console and navigate around — count the "RUN SETSTORE"
 * logs. Each click should print 2-4 of them.
 */
export default function SetStore({ state }: { state: State }) {
  useEffect(() => {
    console.log("RUN SETSTORE", { route: globalThis.location?.pathname, state });
  }, [state, state?.userContext]);

  return null;
}
