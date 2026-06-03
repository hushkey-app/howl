import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../howl.config.ts";

const DESCRIPTION =
  "Software engineer — full-stack Deno, TypeScript, distributed systems. Selected projects, experience, and contact.";
const OG_IMAGE = "/og.png";

export default function App(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  const title = props.state.client?.title ?? "CV";
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="stylesheet" href="/style.css" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />

        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
      </head>
      <body client-nav="true" client-prefetch="true">
        <Outlet />
      </body>
    </html>
  );
}
