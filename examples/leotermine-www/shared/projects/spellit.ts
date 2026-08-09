import type { Project } from "./types.ts";

/**
 * Spellit.
 *
 * NOT LISTED YET — the import is commented out in `index.ts` because there is
 * no icon and no shipped build to point at. Re-enable it there once both
 * exist, and replace the placeholder copy below: `tagline`, `summary`, `year`,
 * `status` and `links`, plus an `icon` or `cover`. Add a `support` block if it
 * ships as an app needing `/spellit/privacy` and `/spellit/support` here.
 */
export const spellit: Project = {
  slug: "spellit",
  name: "Spellit",
  tagline: "Placeholder — needs a real one-liner",
  summary:
    "Details pending. This card exists so the project is in the grid and the filters — swap the copy in `shared/projects/spellit.ts` and it updates everywhere.",
  year: "2026",
  status: "building",
  hue: 88,
  languages: ["TypeScript", "React Native"],
  links: [],
};
