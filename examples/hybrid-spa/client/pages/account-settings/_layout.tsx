import type { Context } from "@hushkey/howl";
import type { JSX } from "preact/jsx-runtime";
import type { State } from "../../../howl.config.ts";
import Topbar from "../../islands/topbar.island.tsx";

const linkClass =
  "block px-3 py-2 rounded-md text-sm transition-colors text-violet-300/70 " +
  "hover:text-violet-100 hover:bg-violet-950/60 " +
  "data-[current]:bg-violet-600 data-[current]:text-white data-[current]:font-semibold";

/**
 * Child layout for /account-settings/* — adds a Topbar island (ssr:false, so
 * flickers on direct landing) and a side-nav. Mirrors the hushkey
 * SettingsLayout structure.
 */
export default function AccountSettingsLayout(
  { Component }: Context<State>,
): JSX.Element {
  return (
    <div class="border border-violet-900/40 rounded-lg overflow-hidden mt-4">
      <Topbar />
      <div class="grid grid-cols-[180px_1fr] min-h-[300px]">
        <aside class="border-r border-violet-900/40 bg-violet-950/20 p-3 flex flex-col gap-1">
          <a class={linkClass} href="/account-settings">Overview</a>
          <a class={linkClass} href="/account-settings/profile">Profile</a>
          <a class={linkClass} href="/account-settings/security">Security</a>
        </aside>
        <main class="p-4">
          <Component />
        </main>
      </div>
    </div>
  );
}
