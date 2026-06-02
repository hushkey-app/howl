import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";

/** Shared layout — nav + active-link, like vuety's `_layout.vue`. */
export default function Layout(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  const path = props.url.pathname;
  const link = (href: string, active: boolean) =>
    active ? "font-bold text-primary" : "text-base-content/70 hover:text-base-content";
  return (
    <div className="max-w-2xl mx-auto p-5">
      <nav className="flex gap-4 items-center mb-6 pb-3 border-b border-base-300">
        <a href="/" className={link("/", path === "/")}>Home</a>
        <a href="/about" className={link("/about", path === "/about")}>About</a>
        <span className="text-xs text-base-content/40">· routed at {path}</span>
      </nav>
      <Outlet />
    </div>
  );
}
