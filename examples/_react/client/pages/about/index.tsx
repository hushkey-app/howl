import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";

export default function About(props: ReactPageProps<unknown, State>) {
  useHead({
    title: "About · Reacty",
    meta: [{ name: "description", content: "About this React-on-Howl demo." }],
  });

  return (
    <main className="container">
      <header>
        <h1 className="text-2xl font-bold mb-2">📖 About</h1>
        <p className="text-base-content/70">
          A second full React page, served at <code>{props.url.pathname}</code>{" "}
          by Howl's own file-system router — no React Router involved.
        </p>
      </header>
    </main>
  );
}
