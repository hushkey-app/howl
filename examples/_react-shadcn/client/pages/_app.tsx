import type { ReactPageProps } from "@hushkey/howl-react";

/**
 * The document shell — owns the whole `<html>`. The engine passes the page tree
 * (wrapped in `#howl-app`) as `Component`. Body styling comes from the shadcn
 * `@layer base` rule in `static/style.css` (`bg-background text-foreground`).
 */
export default function App(props: ReactPageProps) {
  const Outlet = props.Component!;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body client-nav="true" client-prefetch="true" className="min-h-screen antialiased">
        <Outlet />
      </body>
    </html>
  );
}
