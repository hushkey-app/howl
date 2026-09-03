import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useEscape, useScrollLock } from "@/lib/motion.ts";
import { playSound } from "@/lib/sound.ts";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { EMAIL } from "../../shared/profile.ts";

const LINKS = [
  { hash: "#projects", label: "Projects" },
  { hash: "#contact", label: "Contact" },
];

/** Props for {@linkcode Nav}. */
export interface NavProps {
  /** Current pathname — decides whether section links need a `/` in front. */
  pathname: string;
}

/**
 * A single floating pill at the top of the page — the same object as every
 * other card, just pinned. Nothing spans the viewport, so the page reads as
 * things resting on a surface rather than a chrome-and-content sandwich.
 */
export function Nav({ pathname }: NavProps) {
  const [open, setOpen] = useState(false);

  const onHome = pathname === "/";
  const href = (hash: string) => (onHome ? hash : `/${hash}`);
  // Client nav replays the server URL and drops the fragment, so cross-page
  // section links have to be real navigations.
  const navMode = onHome ? undefined : ("false" as const);

  useScrollLock(open);
  useEscape(open, () => setOpen(false));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:pt-5">
        <nav className="card flex h-13 items-center gap-1 rounded-full px-2 pr-2">
          <a
            href="/"
            aria-label="Home"
            className="grid size-9 place-items-center rounded-full bg-ink text-xs font-semibold text-canvas transition-opacity duration-300 hover:opacity-85"
          >
            LT
          </a>

          <div className="hidden items-center sm:flex">
            {LINKS.map((link) => (
              <a
                key={link.hash}
                href={href(link.hash)}
                client-nav={navMode}
                className="rounded-full px-4 py-2 text-sm text-ink-dim transition-colors duration-300 hover:bg-canvas-sunk hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </div>

          <ThemeToggle className="ml-1" />

          <button
            type="button"
            onClick={() => {
              playSound(open ? "close" : "open");
              setOpen(!open);
            }}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-9 place-items-center rounded-full text-ink transition-colors duration-300 hover:bg-canvas-sunk sm:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </nav>
      </header>

      <div
        id="mobile-menu"
        aria-hidden={!open}
        className={cn(
          // Below the pill (z-50) so its own close button stays reachable.
          "fixed inset-0 z-40 flex flex-col justify-end p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-300 sm:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="absolute inset-0 bg-[color-mix(in_oklab,var(--canvas)_65%,transparent)] backdrop-blur-sm"
        />

        <div
          className={cn(
            "card relative flex flex-col gap-1.5 rounded-[1.75rem] p-2 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            open ? "translate-y-0" : "translate-y-6",
          )}
        >
          {LINKS.map((link) => (
            <a
              key={link.hash}
              href={href(link.hash)}
              client-nav={navMode}
              onClick={() => setOpen(false)}
              className="flex h-14 items-center rounded-[1.25rem] px-5 text-lg font-medium transition-colors duration-300 active:bg-canvas-sunk"
            >
              {link.label}
            </a>
          ))}
          <a
            href={`mailto:${EMAIL}`}
            className="flex h-14 items-center justify-center rounded-[1.25rem] bg-ink px-5 text-lg font-medium text-canvas"
          >
            Email me
          </a>
        </div>
      </div>
    </>
  );
}
