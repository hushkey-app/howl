import type { Context } from "@hushkey/howl";
import type { State } from "../../howl.config.ts";
import type { FunctionComponent } from "preact";
import type { JSX } from "preact/jsx-runtime";
import Navbar from "../islands/navbar.island.tsx";

type LayoutProps = { Component: FunctionComponent };

const NAV_LINKS = [
  { href: "/", label: "Home (SSR)" },
  { href: "/contact", label: "Contact (SSR)" },
  { href: "/jobs", label: "Jobs (AOT)" },
  { href: "/about", label: "About (SSG)" },
  { href: "/account-settings", label: "Account (nested)" },
];

const linkClass =
  "px-3 py-1.5 rounded-md text-sm transition-colors text-violet-300/70 " +
  "hover:text-violet-100 hover:bg-violet-950/60 " +
  "data-[current]:bg-violet-600 data-[current]:text-white data-[current]:font-semibold " +
  "data-[current]:shadow-lg data-[current]:shadow-violet-600/30 " +
  "data-[current]:hover:bg-violet-600 data-[current]:hover:text-white";

/**
 * Reproducing the hushkey pattern: parent layout is a conditional switcher
 * between `DefaultLayout` (full chrome) and `NestedLayout` (minimal) based
 * on URL. The buggy bit is calling them as **functions** instead of JSX
 * components — preact then treats each call as a fresh subtree, can't
 * reconcile across renders, and islands inside the layouts remount.
 *
 * Swap the function-calls for JSX to fix.
 */
function DefaultLayout(
  { Component }: LayoutProps,
): JSX.Element {
  return (
    <div class="flex-1 pb-(--nav-h) sm:pb-0">
      <Navbar />
      <div class="p-4">
        <h1 class="text-xs uppercase tracking-widest text-base-content/40 mb-2">
          DefaultLayout
        </h1>
        <nav class="flex gap-1 mb-6 flex-wrap">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} class={linkClass} href={href}>{label}</a>
          ))}
        </nav>
        <Component />
      </div>
    </div>
  );
}

function NestedLayout(
  { Component }: LayoutProps,
): JSX.Element {
  return (
    <div class="flex-1 pb-(--nav-h) sm:pb-0">
      <div class="p-4">
        <h1 class="text-xs uppercase tracking-widest text-amber-400/60 mb-2">
          NestedLayout (no main navbar)
        </h1>
        <nav class="flex gap-1 mb-6 flex-wrap">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} class={linkClass} href={href}>{label}</a>
          ))}
        </nav>
        <Component />
      </div>
    </div>
  );
}

export default function PageLayout(
  { Component, url }: Context<State>,
): JSX.Element {
  const nestedPaths = ["/account-settings", "/dashboard"];
  const isNested = nestedPaths.some((p) => url.pathname.startsWith(p));

  // Function-call usage — same anti-pattern as hushkey.
  return isNested
    ? NestedLayout({ Component })
    : DefaultLayout({ Component });
}
