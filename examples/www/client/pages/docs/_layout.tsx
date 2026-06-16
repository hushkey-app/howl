import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../../howl.config.ts";
import { readManifest, readManifestGrouped } from "../../../server/docs/reader.ts";

export default function DocsLayout(props: ReactPageProps<unknown, State>) {
  const { url } = props;
  const Outlet = props.Component!;
  const groups = readManifestGrouped();
  const manifest = readManifest();
  const segments = url.pathname.replace(/\/$/, "").split("/");
  const currentSlug = segments[segments.length - 1] === "docs" ? "" : segments[segments.length - 1];

  return (
    <div className="relative min-h-screen bg-base-100 bg-dot-grid bg-size-[28px_28px]">
      {/* Sidebar + content — pt clears the brand bar (mobile ~64px, desktop ~88px) */}
      <div className="flex pt-20 sm:pt-24">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-base-300 fixed top-24 bottom-0 overflow-y-auto bg-base-100/60 backdrop-blur">
          <div className="p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-base-content/30 mb-3 px-2">
              Documentation
            </p>
            {groups.map((group, gi) => (
              <div key={group.id} className={gi > 0 ? "mt-5 pt-4 border-t border-base-300/70" : ""}>
                <p className="font-mono text-[11px] uppercase tracking-widest text-base-content/40 mb-1.5 px-2">
                  {group.label}
                </p>
                <ul className="menu gap-1 p-0">
                  {group.items.map((item) => {
                    const isActive = item.slug === currentSlug;
                    return (
                      <li key={item.slug}>
                        <a
                          href={`/docs/${item.slug}`}
                          className={`rounded-lg text-base py-2.5 px-3 ${
                            isActive
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-base-content/70 hover:text-base-content hover:bg-base-200"
                          }`}
                        >
                          {item.title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {
          /*
          Mobile bottom padding:
          - < sm: root bottom nav (~64px) + this doc strip (~56px) → pb-32
          - sm – lg: only this strip → pb-20
          - lg+: sidebar only → pb-0
        */
        }
        <div className="flex-1 lg:ml-64 min-w-0 px-4 sm:px-6 lg:px-8 pb-32 sm:pb-20 lg:pb-0">
          <Outlet />
        </div>
      </div>

      {
        /*
        Doc page scroll strip — sits ABOVE the root bottom tab bar on mobile.
        Root nav is sm:hidden (gone at ≥640px), so strip only needs to lift at <sm.
      */
      }
      <div className="lg:hidden fixed bottom-(--nav-h) sm:bottom-0 left-0 right-0 z-40 bg-base-100/95 backdrop-blur border-t border-base-300 px-3 py-2 overflow-x-auto scrollbar-hide">
        <ul className="flex gap-2 min-w-max">
          {manifest.map((item) => {
            const isActive = item.slug === currentSlug;
            return (
              <li key={item.slug}>
                <a
                  href={`/docs/${item.slug}`}
                  className={`btn btn-sm rounded-lg font-mono text-xs ${
                    isActive ? "btn-primary" : "btn-ghost"
                  }`}
                >
                  {item.title}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
