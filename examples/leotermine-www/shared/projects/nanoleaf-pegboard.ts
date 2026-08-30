import type { Project } from "./types.ts";

/** Nanoleaf Pegboard — a Linux driver for a dock that shipped without one. */
export const nanoleafPegboard: Project = {
  slug: "nanoleaf-pegboard",
  name: "Nanoleaf Pegboard",
  tagline: "Linux driver for a dock that has none",
  summary:
    "A userspace driver, control daemon, CLI and Omarchy bar widget for the Nanoleaf Pegboard Desk Dock, which ships with Windows and macOS software only. Rust over libusb with no kernel module: colour, brightness and a travelling rainbow wave are one command each, and reading the dock's state never starts the daemon.",
  year: "2026",
  status: "open source",
  hue: 324,
  languages: ["Rust"],
  cover: "/projects/nanoleaf-pegboard.jpg",
  links: [
    {
      label: "GitHub",
      href: "https://github.com/mirairoad/nanoleaf-pegboard-linux",
      icon: "github",
      primary: true,
    },
  ],
};
