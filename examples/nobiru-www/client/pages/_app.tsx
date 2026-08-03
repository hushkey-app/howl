import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";

/**
 * Document shell. Owns the `<html>` and the app-wide `<head>`; per-page title,
 * description and OG tags come from each page's `useHead()`. No webfont — the
 * system stack Tailwind ships with is the type.
 */
export default function App(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <link rel="stylesheet" href="/style.css" />
        <link rel="icon" type="image/png" href="/logo-192.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body client-nav="true" client-prefetch="true" className="min-h-screen antialiased">
        <Outlet />
      </body>
    </html>
  );
}
