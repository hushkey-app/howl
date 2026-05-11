import { Head } from "@hushkey/howl/runtime";
import type { JSX } from "preact/jsx-runtime";

export default function Settings(): JSX.Element {
  return (
    <>
      <Head>
        <title>Settings — AOT</title>
      </Head>
      <section class="space-y-4">
        <div class="text-xs uppercase tracking-widest text-violet-400 font-bold">
          AOT · __settings.tsx
        </div>
        <h2 class="text-3xl font-bold">Settings</h2>
        <p class="text-base-content/70 leading-relaxed">
          AOT pages receive <code class="bg-base-200 px-1.5 py-0.5 rounded font-mono text-[12px]">{"{ url, params, state }"}</code>{" "}
          when mounted client-side. State is read from <code class="bg-base-200 px-1.5 py-0.5 rounded font-mono text-[12px]">window.__HOWL_USER_STATE__</code>, populated by SSR on the entry document.
        </p>
        <p class="text-base-content/70 leading-relaxed">
          Need interactivity that fires on direct URL hits? Use an island (<code class="bg-base-200 px-1.5 py-0.5 rounded font-mono text-[12px]">*.island.tsx</code>) — they hydrate independently of the AOT path.
        </p>
      </section>
    </>
  );
}
