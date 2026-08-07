import { useHead } from "@hushkey/howl-react/head";
import { ArrowUpRight } from "lucide-react";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Tag } from "@/components/ui/chip.tsx";
import { ProjectShell, Prose } from "@/components/project-shell.tsx";
import { playSound } from "@/lib/sound.ts";
import { getProject } from "../../../shared/projects/index.ts";
import { NAME, ORIGIN } from "../../../shared/profile.ts";

/**
 * A project's overview page. Every project has one, whether or not it hosts
 * support and privacy here — it is the page the grid links to, and the one
 * place that describes the project without immediately sending you off-site.
 * The outbound links are kept in their own block for exactly that reason.
 */
export default function ProjectOverview(props: ReactPageProps<unknown, State>) {
  const project = getProject(props.params?.project as string | undefined);
  const origin = props.state.client?.origin ?? ORIGIN;

  useHead({
    title: project ? `${project.name} — ${project.tagline}` : "Project",
    meta: [{ name: "description", content: project?.summary ?? "" }],
    link: project ? [{ rel: "canonical", href: `${origin}/${project.slug}` }] : [],
  });

  // The server 404s unknown slugs before this renders; this is belt and braces.
  if (!project) return null;

  return (
    <ProjectShell project={project} tab="overview">
      {project.cover && (
        <div className="mb-4 overflow-hidden rounded-[1.25rem] border border-hairline bg-canvas-sunk">
          <img
            src={project.cover}
            alt={`${project.name} — screenshot`}
            width={1200}
            height={750}
            loading="eager"
            decoding="async"
            className="cover-img w-full"
          />
        </div>
      )}

      <div className="space-y-3">
        <Prose title="Written in">
          <div className="flex flex-wrap gap-1.5">
            {project.languages.map((language) => <Tag key={language}>{language}</Tag>)}
          </div>
        </Prose>

        {project.links.length > 0 && (
          <Prose title="Where to find it">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {project.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => playSound("tap")}
                  className="inline-flex items-center gap-1 font-medium text-[var(--accent)] transition-opacity hover:opacity-75"
                >
                  {link.label}
                  <ArrowUpRight className="size-3.5" />
                </a>
              ))}
            </div>
          </Prose>
        )}

        {project.support && (
          <Prose title="Help and legal">
            <p>
              Support questions, troubleshooting and the privacy policy all live on this site — no
              third-party help desk, and no account needed to read them.
            </p>
            <div className="mt-3 flex flex-wrap gap-5">
              <a
                href={`/${project.slug}/support`}
                client-nav="true"
                className="font-medium text-[var(--accent)] transition-opacity hover:opacity-75"
              >
                Support
              </a>
              <a
                href={`/${project.slug}/privacy`}
                client-nav="true"
                className="font-medium text-[var(--accent)] transition-opacity hover:opacity-75"
              >
                Privacy policy
              </a>
            </div>
          </Prose>
        )}

        <p className="pt-3 text-sm text-ink-faint">
          {project.name} is built and maintained by {NAME}.
        </p>
      </div>
    </ProjectShell>
  );
}
