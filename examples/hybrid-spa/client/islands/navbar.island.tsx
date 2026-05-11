import { useEffect } from "preact/hooks";

/**
 * Main navbar — used by DefaultLayout. Has a useEffect to track mounts so we
 * can confirm whether function-as-component pattern in parent layout makes
 * preact remount it on every render.
 */
export default function Navbar() {
  useEffect(() => {
    console.log("NAVBAR mount");
    return () => console.log("NAVBAR unmount");
  }, []);

  return (
    <header class="border-b border-base-300 px-4 py-3 flex items-center justify-between">
      <span class="font-mono text-sm font-bold">🐺 demo app</span>
      <span class="font-mono text-[10px] text-base-content/40">main navbar</span>
    </header>
  );
}
