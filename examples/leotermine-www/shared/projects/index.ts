/**
 * The project registry. Import a new project file, drop it in `PROJECTS`, and
 * the grid, the filter bar and the hosted `/[project]` routes all pick it up.
 */
import type { Language, Project } from "./types.ts";
import { nobiru } from "./nobiru.ts";
import { howl } from "./howl.ts";
import { hound } from "./hound.ts";
import { pack } from "./pack.ts";
import { hushkey } from "./hushkey.ts";
// import { spellit } from "./spellit.ts"; // hidden until it has an icon and a build

export type {
  ContentSection,
  FaqEntry,
  Language,
  Project,
  ProjectLink,
  ProjectSupport,
} from "./types.ts";

/** Every project, in the order they appear on the home page. */
export const PROJECTS: Project[] = [nobiru, howl, hound, pack, hushkey /*, spellit */];

/** Look up a project by URL slug. Returns `undefined` for unknown slugs. */
export function getProject(slug: string | undefined): Project | undefined {
  if (!slug) return undefined;
  return PROJECTS.find((project) => project.slug === slug.toLowerCase());
}

/**
 * Every language across every project, ordered by how many projects use it and
 * then alphabetically — so the filter bar leads with the ones that actually
 * narrow the grid.
 */
export function allLanguages(): Language[] {
  const counts = new Map<Language, number>();
  for (const project of PROJECTS) {
    for (const language of project.languages) {
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([language]) => language);
}
