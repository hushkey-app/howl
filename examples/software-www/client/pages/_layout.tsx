import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../howl.config.ts";
import { readProfile } from "../../server/cv/reader.ts";

function DockIcon({ label }: { label: string }) {
  const cls = "w-5 h-5";
  switch (label.toLowerCase()) {
    case "home":
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
          />
        </svg>
      );
    case "github":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.36-3.88-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.52-2.55-.29-5.24-1.27-5.24-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.03 0 0 .96-.31 3.15 1.17a10.94 10.94 0 0 1 5.74 0c2.19-1.48 3.15-1.17 3.15-1.17.62 1.58.23 2.74.11 3.03.74.8 1.18 1.82 1.18 3.07 0 4.39-2.69 5.36-5.25 5.64.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"
          />
        </svg>
      );
    case "email":
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21.75 6.75-9.75 7.5-9.75-7.5m19.5 0v10.5a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V6.75m19.5 0A1.5 1.5 0 0 0 20.25 5.25H3.75A1.5 1.5 0 0 0 2.25 6.75"
          />
        </svg>
      );
    default:
      return (
        <svg
          className={cls}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

const DOCK_BUTTON_CLASS =
  "group relative w-11 h-11 rounded-full border border-base-300 bg-base-200/80 backdrop-blur flex items-center justify-center text-base-content/60 hover:text-primary hover:border-primary/50 hover:bg-primary/10 transition-all shadow-sm";

const DOCK_TOOLTIP_CLASS =
  "pointer-events-none absolute right-full mr-3 px-2.5 py-1 rounded-md bg-base-content/90 text-base-100 font-mono text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity";

export default function Layout(props: ReactPageProps<unknown, State>) {
  const { url, state } = props;
  const Outlet = props.Component!;
  const profile = readProfile();
  const isHome = url.pathname === "/";
  const isProjects = url.pathname.startsWith("/projects");
  const isAbout = url.pathname.startsWith("/about");
  const title = state.client?.title ?? profile.name;

  return (
    <main className="flex flex-col min-h-screen pb-(--nav-h) sm:pb-0">
      {/* Top brand bar */}
      <div className="fixed top-0 left-0 right-0 z-40 pointer-events-none h-20 sm:h-24 bg-linear-to-b from-base-100/95 via-base-100/70 to-transparent backdrop-blur-md mask-[linear-gradient(to_bottom,black_55%,transparent)]" />

      {/* Top-left brand */}
      <a href="/" className="fixed top-0 left-0 z-50 p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
        <img src="/logo.svg" alt={title} className="w-11 h-11 sm:w-14 sm:h-14" />
        <div className="flex flex-col leading-none gap-1">
          <span className="font-mono font-black text-xl sm:text-2xl text-base-content/90 tracking-tight">
            {profile.name.toLowerCase()}
          </span>
          <span className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.25em] text-base-content/40">
            {profile.studio}
          </span>
        </div>
      </a>

      {/* Top-right nav — desktop only */}
      <nav className="fixed top-0 right-0 z-50 hidden sm:flex items-center gap-2 p-4">
        <a
          href="/projects"
          className={`btn btn-ghost btn-md rounded-xl text-base ${
            isProjects
              ? "text-primary bg-primary/10"
              : "text-base-content/70 hover:text-base-content hover:bg-primary/30"
          }`}
        >
          Products
        </a>
        <a
          href="/about"
          className={`btn btn-ghost btn-md rounded-xl text-base ${
            isAbout
              ? "text-primary bg-primary/10"
              : "text-base-content/70 hover:text-base-content hover:bg-primary/30"
          }`}
        >
          About
        </a>
        <a
          href={`mailto:${profile.email}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-md rounded-xl text-base font-bold"
        >
          Get in touch
        </a>
      </nav>

      {/* Page content — flex-1 sticks footer to viewport bottom on short pages */}
      <div className="flex-1 flex flex-col">
        <Outlet />
      </div>

      {/* Footer — entity + legal */}
      <footer className="bg-base-100/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-1 text-center sm:text-left">
          <p className="font-mono text-xs text-base-content/60">
            &copy; {new Date().getFullYear()}{" "}
            Hushkey Pty Ltd<span className="text-primary font-bold">.</span>{" "}
            <span className="text-base-content/40">ACN 696 608 849</span>
          </p>
          <p className="font-mono text-xs text-base-content/60">
            {profile.name.toLowerCase()}
            <span className="text-primary font-bold">.</span> {profile.studio}
          </p>
        </div>
      </footer>

      {/* Bottom tab bar — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden flex items-stretch bg-base-100/98 backdrop-blur-md border-t border-base-300 safe-area-bottom">
        <a
          href="/"
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
            isHome ? "text-primary" : "text-base-content/50"
          }`}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
            />
          </svg>
          <span className="font-mono text-[11px] font-bold">Studio</span>
        </a>
        <a
          href="/projects"
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
            isProjects ? "text-primary" : "text-base-content/50"
          }`}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75A1.5 1.5 0 0 1 5.25 5.25h13.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V6.75ZM3.75 9.75h16.5"
            />
          </svg>
          <span className="font-mono text-[11px] font-bold">Products</span>
        </a>
        <a
          href={`mailto:${profile.email}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors text-base-content/50"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21.75 6.75-9.75 7.5-9.75-7.5m19.5 0v10.5a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V6.75m19.5 0A1.5 1.5 0 0 0 20.25 5.25H3.75A1.5 1.5 0 0 0 2.25 6.75"
            />
          </svg>
          <span className="font-mono text-[11px] font-bold">Contact</span>
        </a>
      </nav>

      {/* Floating dock — desktop only (mobile has the bottom tab bar) */}
      <aside className="hidden sm:flex fixed bottom-6 right-6 z-40 flex-col gap-2.5">
        {!isHome && (
          <a
            href="/"
            title="Home"
            aria-label="Home"
            className={DOCK_BUTTON_CLASS}
          >
            <DockIcon label="home" />
            <span className={DOCK_TOOLTIP_CLASS}>Home</span>
          </a>
        )}
        {profile.social.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${s.label} · ${s.handle}`}
            aria-label={`${s.label} — ${s.handle}`}
            className={DOCK_BUTTON_CLASS}
          >
            <DockIcon label={s.label} />
            <span className={DOCK_TOOLTIP_CLASS}>{s.handle}</span>
          </a>
        ))}
      </aside>
    </main>
  );
}
