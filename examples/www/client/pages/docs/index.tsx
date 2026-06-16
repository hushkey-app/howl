import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../../howl.config.ts";
import { readManifestGrouped } from "../../../server/docs/reader.ts";
import { useHead } from "@hushkey/howl-react/head";

export default function DocsIndex(props: ReactPageProps<unknown, State>) {
  const groups = readManifestGrouped();
  const title = props.state.client.title;

  useHead({
    title: `${title} — Documentation`,
    meta: [
      {
        name: "description",
        content: `Guides and API reference for ${title}, the full-stack Deno framework.`,
      },
      { property: "og:title", content: `${title} — Documentation` },
      {
        property: "og:description",
        content: `Guides and API reference for ${title}, the full-stack Deno framework.`,
      },
      { property: "og:image", content: "https://howl.hushkey.dev/og-image.png" },
      { property: "og:url", content: "https://howl.hushkey.dev/docs" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  });

  return (
    <>
      {/* Mobile: px-0 full-bleed. Desktop: centered with padding. */}
      <div className="sm:max-w-3xl sm:mx-auto sm:px-6">
        {/* Hero */}
        <div className="mb-8 sm:mb-10 px-0">
          <p className="font-mono text-xs uppercase tracking-widest text-base-content/50 mb-2">
            Documentation
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            {title} Docs
          </h1>
          <p className="text-base sm:text-lg text-base-content/70 sm:text-base-content/60 leading-relaxed">
            Server-first, Deno-native full-stack framework. Typed endpoints, pluggable Vue/React
            engines, built-in RBAC, and middleware that propagates to every response.
          </p>
          <div className="flex gap-2 mt-4 flex-wrap">
            {["Deno 2.x", "Vue 3", "React 18", "TypeScript"].map((t) => (
              <kbd key={t} className="kbd kbd-sm sm:kbd-md font-mono text-xs sm:text-sm">{t}</kbd>
            ))}
          </div>
        </div>

        {/* Quick start */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur px-5 py-4 mb-8 sm:mb-10">
          <p className="font-mono text-xs text-primary/70 uppercase tracking-widest mb-2">
            quick start
          </p>
          <div className="font-mono text-sm overflow-x-auto whitespace-nowrap">
            <span className="text-primary/60 select-none mr-1">$</span>
            <span className="text-base-content/70">deno add</span>
            <span className="text-primary font-semibold">jsr:@hushkey/howl</span>
          </div>
        </div>

        {/* Section grid, grouped by category */}
        {groups.map((group) => (
          <div key={group.id} className="mb-8 sm:mb-10">
            <p className="font-mono text-xs uppercase tracking-widest text-base-content/40 mb-3 px-0">
              {group.label}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {group.items.map((item) => (
                <a
                  key={item.slug}
                  href={`/docs/${item.slug}`}
                  className="group rounded-2xl border border-base-300 bg-base-200/60 backdrop-blur hover:border-primary/40 hover:bg-base-200 transition-all overflow-hidden"
                >
                  <div className="px-5 py-4 sm:py-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold text-base sm:text-base group-hover:text-primary transition-colors">
                        {item.title}
                      </h2>
                      <span className="text-base-content/30 group-hover:text-primary transition-colors text-lg shrink-0">
                        →
                      </span>
                    </div>
                    <p className="text-sm text-base-content/60 mt-1.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-base-300 flex gap-6 text-sm text-base-content/40 font-mono px-0">
          <a
            href="https://jsr.io/@hushkey/howl"
            className="hover:text-base-content transition-colors"
            target="_blank"
          >
            JSR ↗
          </a>
          <a
            href="https://github.com/hushkey-app/howl"
            className="hover:text-base-content transition-colors"
            target="_blank"
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </>
  );
}
