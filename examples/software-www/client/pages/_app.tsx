import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../howl.config.ts";

const OG_IMAGE = "/og.png";

/**
 * Document shell. Owns the `<html>` + app-wide `<head>` (charset, viewport,
 * stylesheet, favicon, default share image). Per-page title and description
 * come from each page's `useHead()` (`@hushkey/howl-react/head`).
 */
export default function App(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="stylesheet" href="/style.css" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />

        <meta property="og:type" content="website" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={OG_IMAGE} />
      </head>
      <body client-nav="true" client-prefetch="true">
        <Outlet />
      </body>
    </html>
  );
}
