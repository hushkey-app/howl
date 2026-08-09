import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn, hueVars } from "@/lib/utils.ts";
import { playSound } from "@/lib/sound.ts";
import { Chip, Tag } from "@/components/ui/chip.tsx";
import {
  allLanguages,
  type Language,
  type Project,
  PROJECTS,
} from "../../shared/projects/index.ts";

/**
 * Whether the language filter and its result count are shown.
 *
 * Both are built and working — hidden for now because five projects fit on one
 * screen, and a filter that never narrows anything is furniture. Flip to
 * `true` when the grid is long enough to earn it; nothing else needs changing.
 */
const SHOW_FILTER = false;

/**
 * The projects grid and its filter.
 *
 * Filtering is OR across the selected languages — pick TypeScript and Swift
 * and you get everything written in either — with the rule spelled out in the
 * line under the chips so nobody has to guess how it combines.
 */
export function ProjectGrid() {
  const [selected, setSelected] = useState<Language[]>([]);
  const languages = useMemo(allLanguages, []);

  const visible = useMemo(() => {
    if (selected.length === 0) return PROJECTS;
    return PROJECTS.filter((project) =>
      project.languages.some((language) => selected.includes(language))
    );
  }, [selected]);

  const toggle = (language: Language) => {
    setSelected((current) =>
      current.includes(language)
        ? current.filter((item) => item !== language)
        : [...current, language]
    );
  };

  return (
    <div>
      {SHOW_FILTER && (
        <>
          <div className="flex flex-wrap gap-2">
            <Chip active={selected.length === 0} onClick={() => setSelected([])}>All</Chip>
            {languages.map((language) => (
              <Chip
                key={language}
                active={selected.includes(language)}
                onClick={() => toggle(language)}
              >
                {language}
              </Chip>
            ))}
          </div>

          <p aria-live="polite" className="mt-4 text-sm text-ink-faint">
            {selected.length === 0
              ? `${PROJECTS.length} projects`
              : `${visible.length} ${visible.length === 1 ? "project" : "projects"} in ${
                selected.join(" or ")
              }`}
          </p>
        </>
      )}

      {visible.length === 0
        ? (
          <div
            className={cn("card rounded-[1.5rem] px-6 py-14 text-center", SHOW_FILTER && "mt-6")}
          >
            <p className="text-lg font-semibold">Nothing in that language</p>
            <p className="mt-1 text-sm text-ink-dim">Clear the filter to see everything again.</p>
          </div>
        )
        : (
          <ul className={cn("grid gap-4 sm:grid-cols-2", SHOW_FILTER && "mt-6")}>
            {visible.map((project) => <ProjectCard key={project.slug} project={project} />)}
          </ul>
        )}
    </div>
  );
}

/**
 * What fills the cover panel, in order of how much it actually says about the
 * project: a real screenshot, then the app's own icon floated on its accent,
 * then a monogram. No mock screenshots — a fake one of something you cannot go
 * and look at is worse than none.
 */
function CoverArt({ project }: { project: Project }) {
  if (project.cover) {
    return (
      <img
        src={project.cover}
        alt={`${project.name} — screenshot`}
        width={1200}
        height={750}
        loading="lazy"
        decoding="async"
        className="cover-img size-full object-cover object-top"
      />
    );
  }

  return (
    <div className="cover-gradient grid size-full place-items-center">
      {project.icon
        ? (
          <img
            src={project.icon}
            alt={`${project.name} app icon`}
            width={256}
            height={256}
            loading="lazy"
            decoding="async"
            className="relative size-20 rounded-[1.25rem] shadow-[0_12px_30px_-10px_oklch(0_0_0/0.45)]"
          />
        )
        : (
          <span aria-hidden="true" className="relative text-4xl font-semibold text-[var(--accent)]">
            {project.name.charAt(0)}
          </span>
        )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const primary = project.links.find((link) => link.primary) ?? project.links[0];
  const overviewHref = `/${project.slug}`;

  return (
    <li
      style={hueVars(project.hue)}
      className="hued card card-hover group flex flex-col rounded-[1.5rem] p-2"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") playSound("hover");
      }}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-[1.15rem] bg-canvas-sunk ring-1 ring-inset ring-[var(--hairline)]">
        <CoverArt project={project} />

        <span className="absolute left-3 top-3 rounded-full bg-[oklch(1_0_0/0.82)] px-2.5 py-1 text-[0.65rem] font-medium text-[oklch(0.24_0.012_265)] backdrop-blur-md">
          {project.status}
        </span>

        {/* Pointer devices get the actions on hover; touch gets the row below. */}
        <div className="hover-actions absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-[oklch(0_0_0/0.62)] to-transparent p-3 pt-10">
          <a
            href={overviewHref}
            client-nav="true"
            onClick={() => playSound("tap")}
            className="inline-flex h-9 items-center rounded-full bg-[oklch(1_0_0/0.95)] px-4 text-sm font-medium text-[oklch(0.24_0.012_265)] transition-transform duration-200 hover:scale-[1.03]"
          >
            Overview
          </a>
          {primary && (
            <a
              href={primary.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => playSound("tap")}
              className="inline-flex h-9 items-center gap-1 rounded-full bg-[oklch(1_0_0/0.16)] px-4 text-sm font-medium text-white backdrop-blur-md transition-colors duration-200 hover:bg-[oklch(1_0_0/0.28)]"
            >
              {primary.label}
              <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="px-3 pb-1 pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-base font-semibold">
            <a
              href={overviewHref}
              client-nav="true"
              onClick={() => playSound("tap")}
              className="transition-opacity hover:opacity-70"
            >
              {project.name}
            </a>
          </h3>
          <span className="shrink-0 text-xs text-ink-faint">{project.year}</span>
        </div>

        {
          /* Neutral, not the project accent: six cards each colouring their own
            subtitle read as six unrelated things. The accent still does its job
            on the cover panel. */
        }
        <p className="mt-0.5 text-sm leading-snug text-ink-dim">{project.tagline}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.languages.map((language) => <Tag key={language}>{language}</Tag>)}
        </div>

        <div className="touch-actions mt-4 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <a
            href={overviewHref}
            client-nav="true"
            className="font-medium text-[var(--accent)]"
          >
            Overview
          </a>
          {primary && (
            <a
              href={primary.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-ink-dim"
            >
              {primary.label}
              <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
