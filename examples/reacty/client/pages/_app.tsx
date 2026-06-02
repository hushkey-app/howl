import type { ReactPageProps } from "@hushkey/howl-react";

/**
 * The document shell — like vuety's `_app.vue`, it owns the whole `<html>`.
 * The engine passes the page tree (wrapped in `#howl-app`) as `Component`.
 */
export default function App(props: ReactPageProps) {
  const Outlet = props.Component!;
  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* <title>Reacty · Howl + React</title> */}
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body client-nav="" client-prefetch="" className="bg-base-100 text-base-content">
        <Outlet />
      </body>
    </html>
  );
}
