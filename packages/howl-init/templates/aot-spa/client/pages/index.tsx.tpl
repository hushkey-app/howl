import { Head } from "@hushkey/howl/runtime";
import type { Context } from "@hushkey/howl";
import type { JSX } from "preact/jsx-runtime";
import type { State } from "../../howl.config.ts";

export default function Home(ctx: Context<State>): JSX.Element {
  return (
    <>
      <Head>
        <title>Home — {ctx.state.client.appName}</title>
      </Head>
      <section class="space-y-4">
        <div class="text-xs uppercase tracking-widest text-cyan-400 font-bold">
          SSR · index.tsx
        </div>
        <h2 class="text-3xl font-bold">Welcome</h2>
        <p class="text-base-content/70 leading-relaxed">
          This page is plain server-side rendered. The renderer runs on every request and partial-nav fetches a fragment when you click a regular link.
        </p>
        <ul class="space-y-2 text-sm text-base-content/60 list-disc list-inside">
          <li>Click <span class="text-violet-400 font-mono">Dashboard</span>{" "}
            (AOT) — Network panel shows a tiny chunk download, no document fetch.
          </li>
          <li>Click <span class="text-emerald-400 font-mono">About</span>{" "}
            (SSG) — direct hits serve prerendered HTML from the build snapshot.
          </li>
          <li>Click <span class="text-cyan-400 font-mono">Home</span>{" "}
            from any other page — partial-nav fetches a fragment to keep things SPA-feel.
          </li>
        </ul>
      </section>
    </>
  );
}
