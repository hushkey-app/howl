import type { JSX } from "preact/jsx-runtime";

export default function AccountSecurity(): JSX.Element {
  return (
    <section class="space-y-2">
      <div class="text-xs uppercase tracking-widest text-violet-400 font-bold">
        AOT · /account-settings/security
      </div>
      <h2 class="text-xl font-bold">Security</h2>
      <p class="text-sm text-base-content/60">
        Second AOT page. Side-nav active state should follow you. SetStore
        useEffect count should increment in the console on every nav (the
        bug).
      </p>
    </section>
  );
}
