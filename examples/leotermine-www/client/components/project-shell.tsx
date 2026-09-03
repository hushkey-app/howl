import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { cn, hueVars } from "@/lib/utils.ts";
import { playSound } from "@/lib/sound.ts";
import type { Project } from "../../shared/projects/index.ts";

/** The three pages a hosted project can have. */
export type ProjectTab = "overview" | "support" | "privacy";

const TABS: { id: ProjectTab; label: string; suffix: string }[] = [
  { id: "overview", label: "Overview", suffix: "" },
  { id: "support", label: "Support", suffix: "/support" },
  { id: "privacy", label: "Privacy", suffix: "/privacy" },
];

/** Props for {@linkcode ProjectShell}. */
export interface ProjectShellProps {
  /** The project being displayed. */
  project: Project;
  /** Which tab is current. */
  tab: ProjectTab;
  /** Page body. */
  children: ReactNode;
}

/**
 * The shared frame for every hosted project page. Identical on every tab —
 * icon, name, tagline, summary, spec line, store link, tabs — so moving
 * between them only changes what is underneath.
 *
 * One number on the project — `hue` — re-themes the whole subtree through
 * `--accent`, so each app's pages feel like their own place while staying
 * recognisably part of the site.
 */
export function ProjectShell({ project, tab, children }: ProjectShellProps) {
  const support = project.support;
  const primary = project.links.find((link) => link.primary);

  const meta = [
    support?.platforms.join(" · "),
    support?.version && `v${support.version}`,
    support?.requires,
    support?.price,
  ].filter(Boolean) as string[];

  return (
    <div style={hueVars(project.hue)} className="hued mx-auto w-full max-w-2xl px-5">
      <header className="pt-10 sm:pt-14">
        <a
          href="/"
          onClick={() => playSound("tap")}
          className="back-button group"
        >
          <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
          Back
        </a>

        <div className="mt-6 flex items-start gap-4">
          {project.icon
            ? (
              <img
                src={project.icon}
                alt=""
                width={256}
                height={256}
                className="size-14 shrink-0 rounded-[1rem] shadow-[0_8px_20px_-8px_oklch(0_0_0/0.4)]"
              />
            )
            : (
              <span
                aria-hidden="true"
                className="grid size-14 shrink-0 place-items-center rounded-[1rem] border border-hairline bg-[var(--accent-soft)] text-xl font-semibold text-[var(--accent)]"
              >
                {project.name.charAt(0)}
              </span>
            )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h1>
            <p className="mt-0.5 text-ink-dim">{project.tagline}</p>
          </div>
        </div>

        {
          /* The project's own summary, identical on all three tabs — the header
            should not restate itself differently depending on where you are.
            Anything page-specific goes in a block below, not up here. */
        }
        <p className="mt-6 leading-relaxed text-ink-dim">{project.summary}</p>

        {meta.length > 0 && <p className="mt-4 text-sm text-ink-faint">{meta.join("  ·  ")}</p>}

        {primary && (
          <a
            href={primary.href}
            target="_blank"
            rel="noreferrer"
            onClick={() => playSound("tap")}
            className="mt-5 inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
          >
            {primary.label}
            <ArrowUpRight className="size-4" />
          </a>
        )}

        {support && (
          // Block wrapper so the tab pill starts its own row rather than
          // flowing next to the store button.
          <nav className="card mt-8 flex w-fit gap-1 rounded-full p-1" aria-label="Project">
            {TABS.map((entry) => {
              const active = entry.id === tab;
              return (
                <a
                  key={entry.id}
                  href={`/${project.slug}${entry.suffix}`}
                  client-nav="true"
                  aria-current={active ? "page" : undefined}
                  onClick={() => playSound("tap")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition-all duration-300",
                    active
                      ? "bg-ink font-medium text-canvas"
                      : "text-ink-dim hover:bg-canvas-sunk hover:text-ink",
                  )}
                >
                  {entry.label}
                </a>
              );
            })}
          </nav>
        )}
      </header>

      <div className="pt-10">{children}</div>
    </div>
  );
}

/** Props for {@linkcode Prose}. */
export interface ProseProps {
  /** Section heading. */
  title: string;
  /** Section body. */
  children: ReactNode;
  /** Extra classes. */
  className?: string;
}

/** One titled block on a project page — the unit both hosted pages repeat. */
export function Prose({ title, children, className }: ProseProps) {
  return (
    <section className={cn("card rounded-[1.25rem] p-5", className)}>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-ink-dim">{children}</div>
    </section>
  );
}
