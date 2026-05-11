import type { PageProps } from "@hushkey/howl";
import { Partial } from "@hushkey/howl/runtime";
import type { JSX } from "preact/jsx-runtime";
import type { State } from "../../howl.config.ts";

export default function App({ Component, state }: PageProps<unknown, State>): JSX.Element {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{state.client.appName}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body f-client-nav class="min-h-screen bg-base-100 text-base-content">
        <Partial name="main">
          <Component />
        </Partial>
      </body>
    </html>
  );
}
