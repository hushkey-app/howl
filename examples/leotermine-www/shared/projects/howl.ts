import type { Project } from "./types.ts";

/** Howl — the Deno-native SSR framework this very site runs on. */
export const howl: Project = {
  slug: "howl",
  name: "Howl",
  tagline: "Server-first full-stack framework for Deno",
  summary:
    "A Deno framework with no Vite and no Next underneath it: file-system routing, typed API contracts, and pluggable React and Vue engines. Compiles to a single self-contained binary.",
  year: "2024",
  status: "open source",
  hue: 200,
  languages: ["TypeScript", "React", "Vue"],
  featured: true,
  cover: "/projects/howl.jpg",
  links: [
    { label: "Docs", href: "https://howl.hushkey.dev", icon: "docs", primary: true },
    { label: "JSR", href: "https://jsr.io/@hushkey/howl", icon: "globe" },
  ],
};
