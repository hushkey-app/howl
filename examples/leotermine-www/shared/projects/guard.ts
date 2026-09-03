import type { Project } from "./types.ts";

/** Guard — the cloud control plane the Hushkey products are deployed and watched from. */
export const guard: Project = {
  slug: "guard",
  name: "Guard",
  tagline: "Cloud control for the Hushkey stack",
  summary:
    "The control plane the Hushkey products run on: deployments, secrets, container registries, object storage, telemetry and analytics behind one login. It ingests OTLP/HTTP logs, traces and metrics into a single SQLite file and keeps every application's environment variables encrypted per workspace and environment. Written in Go on howl-go, rendered both on the server and in WebAssembly, and shipped as static binaries with no runtime dependencies — the vault is deliberately its own, so a bad dashboard release cannot stop a container from booting.",
  year: "2026",
  status: "live",
  hue: 248,
  languages: ["Go", "WebAssembly"],
  cover: "/projects/guard.jpg",
  links: [
    {
      label: "GitHub",
      href: "https://github.com/hushkey-app/guard",
      icon: "github",
      primary: true,
    },
  ],
};
