import { useEffect, useState } from "preact/hooks";

/**
 * Toasts handler — represents global UI state that should survive navigation
 * (e.g. a sonner-style toaster). Currently sits inside `<Partial>` so it
 * re-mounts on every nav and any pending toast disappears.
 *
 * Move outside `<Partial>` in `_app.tsx` to keep state across nav.
 */
export default function ToastsHandler() {
  const [mountCount, setMountCount] = useState(() => {
    console.log("TOASTS mount");
    return 1;
  });

  useEffect(() => {
    return () => console.log("TOASTS unmount");
  }, []);

  return (
    <div class="fixed bottom-4 right-4 text-xs font-mono text-amber-300 bg-amber-950/40 border border-amber-700/40 rounded px-2 py-1">
      toaster (mount #{mountCount})
    </div>
  );
}
