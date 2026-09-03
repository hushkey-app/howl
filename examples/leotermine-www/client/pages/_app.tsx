import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { THEME_BOOT_SCRIPT } from "@/lib/theme.ts";
import { PREFS_BOOT_SCRIPT } from "@/lib/prefs.ts";

/**
 * Document shell. Owns `<html>` and the app-wide `<head>`; per-page title and
 * meta come from each page's `useHead()`.
 *
 * No webfonts — the type is the system stack. The favicon is an inline SVG
 * data URI, so there is no icon file to keep in sync with the palette either.
 */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23f7f6f3'/%3E%3Ctext x='32' y='43' font-family='-apple-system,Helvetica,Arial,sans-serif' font-size='28' font-weight='600' fill='%232b2b33' text-anchor='middle'%3ELT%3C/text%3E%3C/svg%3E";

export default function App(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#f7f6f3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#181820" media="(prefers-color-scheme: dark)" />

        {
          /*
          Blocking, and intentionally so: it stamps `data-theme` on <html>
          before the first paint, which is the only way to avoid a flash of the
          wrong palette. It runs ahead of the stylesheet for the same reason.
        */
        }
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />

        <link rel="stylesheet" href="/style.css" />
        <link rel="icon" href={FAVICON} />
      </head>
      <body client-nav="true" client-prefetch="true" className="min-h-dvh">
        <Outlet />
      </body>
    </html>
  );
}
