import type { Project } from "./types.ts";

/** RustyDeck — native Elgato Stream Deck control for Linux, Rust + GPUI. */
export const rustydeck: Project = {
  slug: "rustydeck",
  name: "RustyDeck",
  tagline: "Native Stream Deck app for Linux",
  summary:
    "Elgato Stream Deck support for Linux, written in Rust on GPUI — no webview, no plugin runtime, one 26 MiB binary. Keys, touch-strip rectangles and dials are each modelled and configured separately, pages let one deck hold several layouts, and actions run through your login shell so aliases and shell functions resolve the way they do in a terminal.",
  year: "2026",
  status: "open source",
  hue: 12,
  languages: ["Rust"],
  cover: "/projects/rustydeck.jpg",
  links: [
    {
      label: "GitHub",
      href: "https://github.com/mirairoad/rustydeck",
      icon: "github",
      primary: true,
    },
  ],
};
