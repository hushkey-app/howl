import { useEffect, useState } from "preact/hooks";

/**
 * Account-settings topbar — `ssr: false` so the server emits an empty
 * skeleton and the client paints the real content on hydration. This
 * reproduces the visible "topbar flicker" on direct-URL SSR landings.
 *
 * Drop `ssr: false` or supply a `skeleton` placeholder of matching size to
 * eliminate the flicker.
 */
export const howl = { ssr: false };

export default function Topbar() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div class="h-12 bg-violet-950/40 border-b border-violet-900 px-4 flex items-center justify-between text-sm">
      <span class="font-mono text-violet-200">⚙ account-settings topbar</span>
      <span class="font-mono text-[10px] text-violet-300/60">
        {hydrated ? "hydrated" : "..."}
      </span>
    </div>
  );
}
