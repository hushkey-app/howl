import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../howl.config.ts";

/**
 * Document shell. Owns the `<html>` + app-wide `<head>` (charset, viewport,
 * stylesheet, favicon). Per-page title, description, and OG/Twitter tags come
 * from each page's `useHead()` (`@hushkey/howl-react/head`).
 */
export default function App(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        />
        <link rel="stylesheet" href="/style.css" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
      </head>
      <body client-nav="true" client-prefetch="true">
        <Outlet />
      </body>
    </html>
  );
}
