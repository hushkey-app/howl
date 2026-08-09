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

const REGISTERED: Project[] = [nobiru, howl, hound, pack, hushkey /*, spellit */];

/** The first four-digit year in a `year` string, used only for ordering. */
function startYear(project: Project): number {
  const match = project.year.match(/\d{4}/);
  return match ? Number(match[0]) : 0;
}

/**
 * Every project, newest first.
 *
 * Sorted rather than hand-ordered so a new entry lands in the right place on
 * its own. `sort` is stable, so projects sharing a year keep the order they
 * are registered in above — that list is where you break a tie.
 */
export const PROJECTS: Project[] = [...REGISTERED].sort((a, b) => startYear(b) - startYear(a));

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
