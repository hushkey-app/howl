import type { Context } from "@hushkey/howl";
import { VueIsland } from "@hushkey/howl-vue";
import type { State } from "../../howl.config.ts";

export default function VuePage(_ctx: Context<State>) {
  return (
    <main class="prose mx-auto p-8 space-y-4">
      <h1>Vue island demo</h1>
      <p>
        The button below is a Vue 3 single-file component (<code>counter.island.vue</code>) compiled
        with no Vite and mounted as a client island inside this Preact-rendered page.
      </p>
      <VueIsland name="counter" props={{ start: 41 }}>
        <button class="btn" disabled>loading…</button>
      </VueIsland>
    </main>
  );
}
