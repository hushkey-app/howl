import { useHead } from "@hushkey/howl-react/head";
import { useAtom } from "@hushkey/howl-react/store";
import { useHowlState } from "@hushkey/howl-react/state";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { countAtom } from "../../store/index.store.ts";

/**
 * AOT route (`__` prefix) — navigated to entirely on the client (no server
 * round-trip), rendered from the AOT chunk. Still SSRs on a direct landing.
 */
export default function AboutId(props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useAtom(countAtom);
  const state = useHowlState<State>();

  useHead({
    title: `${props.params?.id} · About · Reacty`,
    meta: [{ name: "description", content: "About this React-on-Howl AOT demo." }],
  });

  return (
    <main className="container">
      <header>
        <h1 className="text-2xl font-bold mb-2">📖 About {props.params?.id}</h1>
        <p className="text-base-content/70">
          A second full React page, served at <code>{props.url.pathname}</code>{" "}
          by Howl's own file-system router — no React Router involved.
        </p>
      </header>
      <section className="mt-4">
        <p>Its own counter, shared with the home page via the jotai store:</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-2"
          onClick={() => setCount(count + 1)}
        >
          clicked {count} times
        </button>
      </section>
      <section className="mt-4">
        <p className="text-base-content/70">
          From the auto-synced <code>useHowlState()</code> mirror (server{" "}
          <code>ctx.state</code>, no prop-drilling): app title ={" "}
          <strong className="text-primary">{state.title}</strong>.
        </p>
      </section>
    </main>
  );
}
