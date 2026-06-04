import { useHead } from "@hushkey/howl-react/head";
import { useAtom } from "@hushkey/howl-react/store";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { countAtom } from "../store/index.store.ts";

export default function Index(props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useAtom(countAtom);

  useHead({
    title: "Home · Reacty",
    meta: [
      { name: "description", content: "The Reacty home page — full React SSR on Howl." },
    ],
  });
  return (
    <main className="container">
      <header>
        <h1 className="text-2xl font-bold mb-2">⚛️ Full React page</h1>
        <p className="text-base-content/70">
          This whole page is a <code>.tsx</code>{" "}
          file rendered by React on the server (crawlable SEO — view source!) at{" "}
          <code>{props.url.pathname}</code>, then hydrated into a live SPA.
        </p>
      </header>
      <section className="mt-4">
        <p>
          Server said the app title is{" "}
          <strong className="text-primary">{props.state.title}</strong>.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm mt-2"
          onClick={() => setCount(count + 1)}
        >
          clicked {count} times
        </button>
      </section>
    </main>
  );
}
