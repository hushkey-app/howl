import { Head } from "@hushkey/howl/runtime";
import type { JSX } from "preact/jsx-runtime";

export default function About(): JSX.Element {
  return (
    <>
      <Head>
        <title>About — SSG</title>
      </Head>
      <section class="space-y-4">
        <div class="text-xs uppercase tracking-widest text-emerald-400 font-bold">
          SSG · ___about.tsx
        </div>
        <h2 class="text-3xl font-bold">About</h2>
        <p class="text-base-content/70 leading-relaxed">
          This page was prerendered at <code class="bg-base-200 px-1.5 py-0.5 rounded font-mono text-[12px]">deno task build</code>{" "}
          time. The handler ran once with an empty <code class="bg-base-200 px-1.5 py-0.5 rounded font-mono text-[12px]">ctx</code>, the HTML was baked into the production snapshot, and every direct request now skips the renderer entirely.
        </p>
        <p class="text-base-content/70 leading-relaxed">
          SSG implies AOT — clicking from another AOT/SSG page still uses the client chunk, so navigation feels instant. The static HTML is only for direct URL hits and crawlers.
        </p>
        <div class="rounded-md border border-base-300 bg-base-200 p-4 text-xs font-mono text-base-content/60 space-y-1">
          <div>Don't use SSG for user-specific data — handler runs with no req, no cookies.</div>
          <div>Dynamic params (e.g. <code class="text-emerald-300">/blog/[slug]</code>) require <code class="text-emerald-300">getStaticPaths</code> (roadmap).</div>
        </div>
      </section>
    </>
  );
}
