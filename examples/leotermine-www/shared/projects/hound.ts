import type { Project } from "./types.ts";

/** Hound — type-safe Deno job queue, sorted-set delivery with a stall reaper. */
export const hound: Project = {
  slug: "hound",
  name: "Hound",
  tagline: "Type-safe job queue for Deno",
  summary:
    "A job queue with at-least-once delivery: sorted-set scheduling, a reaper that reclaims whatever a crashed worker left mid-run, cron scheduling and a management API. Runs on Redis, Deno KV or in memory.",
  year: "2025",
  status: "open source",
  hue: 32,
  languages: ["TypeScript"],
  featured: true,
  cover: "/projects/hound.jpg",
  links: [
    { label: "Docs", href: "https://hound.hushkey.dev", icon: "docs", primary: true },
    { label: "GitHub", href: "https://github.com/mirairoad", icon: "github" },
  ],
};
