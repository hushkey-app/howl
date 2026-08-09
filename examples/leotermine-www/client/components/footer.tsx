import { NAME } from "../../shared/profile.ts";

/**
 * Footer. A copyright line and the build credit, nothing else.
 *
 * It used to list every hosted app's support and privacy pages so a crawler
 * could reach them without guessing a slug. That is no longer its job: each
 * card links to `/{project}`, and the project page links on to its own support
 * and privacy tabs, so the crawl path exists either way.
 */
export function Footer() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-2xl px-5 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline pt-6 text-xs text-ink-faint">
        <p>© {new Date().getFullYear()} {NAME}</p>

        <a
          href="https://howl.hushkey.dev"
          className="transition-colors hover:text-ink-dim"
        >
          Built with Howl
        </a>
      </div>
    </footer>
  );
}
