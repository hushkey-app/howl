import type { JSX } from "preact/jsx-runtime";

export default function AccountProfile(): JSX.Element {
  return (
    <section class="space-y-2">
      <div class="text-xs uppercase tracking-widest text-violet-400 font-bold">
        AOT · /account-settings/profile
      </div>
      <h2 class="text-xl font-bold">Profile</h2>
      <p class="text-sm text-base-content/60">
        AOT-flagged page. Click between Profile and Security and watch the
        Network tab — only chunks, no document fetch. Watch the Topbar —
        does it flicker on each transition?
      </p>
    </section>
  );
}
