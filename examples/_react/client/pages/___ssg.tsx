import { useHead } from "@hushkey/howl-react/head";
import { useAtom } from "@hushkey/howl-react/store";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { countAtom } from "../store/index.store.ts";

/**
 * Static (SSG, `___` prefix) page — prerendered to HTML at build time and served
 * as a static snapshot (no per-request render). It still hydrates into a live
 * SPA, and navigation to/from it uses the AOT client chunk.
 */
export default function Ssg(_props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useAtom(countAtom);

  useHead({
    title: "Static · Reacty",
    meta: [{ name: "description", content: "A build-time prerendered SSG page." }],
  });

  return (
    <main className="container">
      <header>
        <h1 className="text-2xl font-bold mb-2">🧊 Static (SSG) page</h1>
        <p className="text-base-content/70">
          This page is <strong>prerendered at build time</strong>{" "}
          and served as a static file — no server render on request. It still hydrates into a live
          SPA, and navigation to/from it uses the AOT client chunk.
        </p>
      </header>
      <section className="mt-4">
        <p>
          The jotai counter starts at its build-time default (<code>0</code>), then is live after
          hydration and persists across navigation:
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm mt-2"
          onClick={() => setCount(count + 1)}
        >
          count = {count}
        </button>
        <p className="text-xs text-base-content/50 mt-3">
          Note: a value computed in the component (e.g.{" "}
          <code>new Date()</code>) is not frozen — it recomputes on hydration and would mismatch the
          static HTML. Frozen values must be serialized. View Source to see the build artifact.
        </p>
      </section>
    </main>
  );
}
