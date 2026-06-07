import { useEffect, useState } from "react";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../howl.config.ts";

const GITHUB_URL = "https://github.com/hushkey-app/howl";
const JSR_URL = "https://jsr.io/@hushkey/howl";

export default function Layout(props: ReactPageProps<unknown, State>) {
  const { url, state } = props;
  const Outlet = props.Component!;
  const isHome = url.pathname === "/";
  const isDocs = url.pathname.startsWith("/docs");
  const version = state.client?.version ?? "";

  // GitHub star count is fetched client-side after hydration (the badge appears
  // once the count lands).
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/public/stars")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setStars(json?.data?.stars ?? null))
      .catch(() => {});
  }, []);
  const starLabel = stars === null
    ? null
    : stars >= 1000
    ? `${(stars / 1000).toFixed(1)}k`
    : String(stars);

  // Hairline bottom border appears only after the page scrolls (PRD §7 — .stuck).
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(globalThis.scrollY > 8);
    onScroll();
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    return () => globalThis.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-base-100 text-ink">
      {/* Sticky, translucent nav — hairline border on scroll */}
      <header
        className={`fixed inset-x-0 top-0 z-50 h-16 backdrop-blur-md transition-colors duration-200 sm:h-18 ${
          stuck
            ? "border-b border-line bg-base-100/85"
            : "border-b border-transparent bg-base-100/50"
        }`}
      >
        <nav className="mx-auto flex h-full max-w-285 items-center gap-4 px-5 sm:px-9">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Howl" className="h-9 w-9 sm:h-10 sm:w-10" />
            <span className="flex flex-col leading-none">
              <span className="font-mono text-lg font-extrabold tracking-tight text-ink">
                howl
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
                by hushkey
              </span>
            </span>
          </a>

          {/* Desktop nav */}
          <div className="ml-auto hidden items-center gap-1 font-mono text-[13px] sm:flex">
            <a
              href="/docs"
              className="rounded-lg px-3 py-2 font-semibold text-ink-2 transition-colors hover:bg-accent-soft hover:text-primary"
            >
              Docs
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-ink-2 transition-colors hover:bg-accent-soft hover:text-primary"
            >
              GitHub <span aria-hidden="true">↗</span>
              {starLabel && (
                <span className="rounded-md bg-line/80 px-1.5 py-0.5 text-[11px] text-ink-3">
                  {starLabel}
                </span>
              )}
            </a>
            <a
              href={JSR_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-ink-2 transition-colors hover:bg-accent-soft hover:text-primary min-[720px]:flex"
            >
              JSR <span aria-hidden="true">↗</span>
            </a>
          </div>
        </nav>
      </header>

      {/* Page content */}
      <div className="flex-1">
        <Outlet />
      </div>

      {/* Footer (PRD §5) */}
      <footer className="border-t border-line bg-base-100 pb-(--nav-h) sm:pb-0">
        <div className="mx-auto flex max-w-285 flex-col items-center justify-between gap-3 px-5 py-6 font-mono text-[12px] text-ink-3 sm:flex-row sm:px-9">
          <p>
            howl v{version} <span className="px-1 text-line-2">·</span>{" "}
            <span className="text-ink-2">MIT</span>
          </p>
          <nav className="flex items-center gap-5">
            <a href="/docs" className="transition-colors hover:text-primary">Docs</a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-primary"
            >
              GitHub
            </a>
            <a
              href={JSR_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-primary"
            >
              JSR
            </a>
          </nav>
          <p>
            howl<span className="text-primary">.</span> by hushkey
          </p>
        </div>
      </footer>

      {/* Bottom tab bar — mobile only */}
      <nav className="safe-area-bottom fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t border-line bg-base-100/98 backdrop-blur-md sm:hidden">
        <a
          href="/"
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
            isHome ? "text-primary" : "text-ink-3"
          }`}
        >
          <svg
            className="h-6 w-6"
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
          <span className="font-mono text-[11px] font-bold">Home</span>
        </a>
        <a
          href="/docs"
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors ${
            isDocs ? "text-primary" : "text-ink-3"
          }`}
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
            />
          </svg>
          <span className="font-mono text-[11px] font-bold">Docs</span>
        </a>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-ink-3 transition-colors"
        >
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          <span className="font-mono text-[11px] font-bold">GitHub</span>
        </a>
        <a
          href={JSR_URL}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-ink-3 transition-colors"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <span className="font-mono text-[11px] font-bold">JSR</span>
        </a>
      </nav>
    </div>
  );
}
