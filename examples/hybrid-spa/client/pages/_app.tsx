import type { JSX } from "preact/jsx-runtime";
import type { PageProps } from "@hushkey/howl";
import { Partial } from "@hushkey/howl/runtime";
import type { State } from "../../howl.config.ts";
import SetStore from "../islands/set-store.island.tsx";
import ToastsHandler from "../islands/toasts.island.tsx";

const TITLE = "Howl — Deno-native fullstack framework";
const DESCRIPTION =
  "Build fullstack Deno apps with file-system routing, islands, signals, and a single JSR package. Zero config, fast SSR.";
const OG_IMAGE = "/og.png";

export default function App({ Component, state }: PageProps<unknown, State>): JSX.Element {
  const title = state.client?.title ?? TITLE;
  return (
    <html>
      <head>
        <meta charset="utf-8" />
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
      <body client-nav f-view-transition>
        {
          /* Reproducing hushkey: utility islands inside <Partial> so each nav
            re-mounts them. Move outside to keep state across nav. */
        }
        <Partial name="main">
          <Component />
          <SetStore state={state} />
          <ToastsHandler />
        </Partial>
      </body>
    </html>
  );
}
