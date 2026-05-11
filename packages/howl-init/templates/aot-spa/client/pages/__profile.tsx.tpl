import { Head } from "@hushkey/howl/runtime";
import type { JSX } from "preact/jsx-runtime";

export default function Profile(): JSX.Element {
  return (
    <>
      <Head>
        <title>Profile — AOT</title>
      </Head>
      <section class="space-y-4">
        <div class="text-xs uppercase tracking-widest text-violet-400 font-bold">
          AOT · __profile.tsx
        </div>
        <h2 class="text-3xl font-bold">Profile</h2>
        <p class="text-base-content/70 leading-relaxed">
          Click between Dashboard, Profile, and Settings — no document fetches in the network tab. The runtime swaps page bodies by mounting the new chunk's <code class="bg-base-200 px-1.5 py-0.5 rounded font-mono text-[12px]">Component(props)</code> into the active <code class="bg-base-200 px-1.5 py-0.5 rounded font-mono text-[12px]">{"<Partial>"}</code> outlet.
        </p>
      </section>
    </>
  );
}
