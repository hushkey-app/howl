import type { Project } from "./types.ts";

/** Hushkey — the multi-vertical platform the other products sit on. */
export const hushkey: Project = {
  slug: "hushkey",
  name: "Hushkey",
  tagline: "Property and jobs, for foreigners in Japan",
  summary:
    "A multi-vertical platform for people relocating to Japan — property and jobs on one shared auth and infrastructure layer. First-party MFA, passkeys and SSO, no third-party identity provider.",
  year: "2025",
  status: "building",
  hue: 352,
  languages: ["TypeScript", "Rust", "React", "React Native"],
  cover: "/projects/hushkey.jpg",
  links: [
    { label: "Visit", href: "https://hushkey.app", icon: "globe", primary: true },
  ],
};
