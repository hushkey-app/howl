import type { PageProps } from "@hushkey/howl";
import type { JSX } from "preact/jsx-runtime";
import type { State } from "../../howl.config.ts";

const LINKS: { href: string; label: string; mode: "SSR" | "AOT" | "SSG" }[] = [
  { href: "/", label: "Home", mode: "SSR" },
  { href: "/dashboard", label: "Dashboard", mode: "AOT" },
  { href: "/profile", label: "Profile", mode: "AOT" },
  { href: "/settings", label: "Settings", mode: "AOT" },
  { href: "/about", label: "About", mode: "SSG" },
];

const MODE_COLOR = {
  SSR: "text-cyan-400",
  AOT: "text-violet-400",
  SSG: "text-emerald-400",
} as const;

export default function Layout(
  { Component }: PageProps<unknown, State>,
): JSX.Element {
  return (
    <div class="mx-auto max-w-3xl px-6 py-10">
      <header class="mb-8">
        <h1 class="text-2xl font-bold mb-1">{{PROJECT_NAME}}</h1>
        <p class="text-base-content/60 text-sm">
          Open DevTools → Network. Click between the links — note that{" "}
          <span class="text-violet-400 font-medium">AOT</span>{" "}
          and <span class="text-emerald-400 font-medium">SSG</span>{" "}
          routes don't fetch a document, only their chunk on first visit.
        </p>
      </header>

      <nav class="mb-10 flex flex-wrap gap-2 border-b border-base-300 pb-4">
        {LINKS.map(({ href, label, mode }) => (
          <a
            key={href}
            href={href}
            class="px-3 py-1.5 rounded-md border border-base-300 bg-base-200/70 hover:bg-base-200 transition-colors flex items-baseline gap-2"
          >
            <span class="text-sm font-medium">{label}</span>
            <span class={`text-[10px] font-black tracking-widest ${MODE_COLOR[mode]}`}>
              {mode}
            </span>
          </a>
        ))}
      </nav>

      <main>
        <Component />
      </main>
    </div>
  );
}
