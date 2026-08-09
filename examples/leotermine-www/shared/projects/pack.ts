import type { Project } from "./types.ts";

/** PACK — realtime B2B team facilitation platform. */
export const pack: Project = {
  slug: "pack",
  name: "PACK",
  tagline: "Realtime facilitation for distributed teams",
  summary:
    "A B2B project-management and workshop platform. The collaboration server is Rust, where realtime work has to stay low-latency, and the same Rust runs in the browser as WebAssembly; the shared whiteboard renders on WebGPU, so a full room stays smooth.",
  year: "2026",
  status: "beta",
  hue: 152,
  languages: ["TypeScript", "Rust", "React", "WebAssembly"],
  featured: true,
  cover: "/projects/pack.jpg",
  links: [
    { label: "Visit", href: "https://pack.hushkey.app", icon: "globe", primary: true },
  ],
};
