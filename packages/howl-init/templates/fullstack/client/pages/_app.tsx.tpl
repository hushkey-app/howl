import type { JSX } from "preact/jsx-runtime";
import type { PageProps } from "@hushkey/howl";
import { Partial } from "@hushkey/howl/runtime";
import type { State } from "../../howl.config.ts";

export default function App({ Component, state }: PageProps<unknown, State>): JSX.Element {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{state.client?.title ?? "{{PROJECT_NAME}}"}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body client-nav>
        <Partial name="main">
          <Component />
        </Partial>
      </body>
    </html>
  );
}
