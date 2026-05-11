import { Head } from "@hushkey/howl/runtime";
import type { JSX } from "preact/jsx-runtime";

export default function Dashboard(): JSX.Element {
  return (
    <>
      <Head>
        <title>Dashboard — AOT</title>
      </Head>
      <section class="space-y-4">
        <div class="text-xs uppercase tracking-widest text-violet-400 font-bold">
          AOT · __dashboard.tsx
        </div>
        <h2 class="text-3xl font-bold">Dashboard</h2>
        <p class="text-base-content/70 leading-relaxed">
          You're on an AOT-rendered route. On first paint the renderer ran (server-side). On subsequent client navs, only this page's ESM chunk is dynamic-imported — no document fetch.
        </p>
        <div class="rounded-md border border-base-300 bg-base-200 p-4 text-xs font-mono text-base-content/60 space-y-1">
          <div>chunk URL: <span class="text-violet-300">/_howl/js/&#123;BUILD_ID&#125;/aot__dashboard.js</span></div>
          <div>cached client-side after first load · re-used across visits</div>
        </div>
      </section>
    </>
  );
}
