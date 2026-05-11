import type { JSX } from "preact/jsx-runtime";

export default function AccountSettingsOverview(): JSX.Element {
  return (
    <section class="space-y-2">
      <div class="text-xs uppercase tracking-widest text-cyan-400 font-bold">
        SSR · /account-settings
      </div>
      <h2 class="text-xl font-bold">Account overview</h2>
      <p class="text-sm text-base-content/60">
        Landing page rendered server-side. Click Profile / Security to navigate
        between AOT pages — Topbar should stay mounted (and not flicker).
      </p>
    </section>
  );
}
