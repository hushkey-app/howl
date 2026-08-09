import { useHead } from "@hushkey/howl-react/head";
import { Mail } from "lucide-react";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Label } from "@/components/ui/chip.tsx";
import { FaqItem } from "@/components/ui/faq-item.tsx";
import { ProjectShell, Prose } from "@/components/project-shell.tsx";
import { playSound } from "@/lib/sound.ts";
import { getProject } from "../../../shared/projects/index.ts";
import { ORIGIN } from "../../../shared/profile.ts";

/**
 * The support page — and the page an App Store listing points at, so it
 * doubles as the app's fact sheet: what it runs on, what it costs, the FAQ,
 * the troubleshooting guides, and one address to write to.
 */
export default function ProjectSupport(props: ReactPageProps<unknown, State>) {
  const project = getProject(props.params?.project as string | undefined);
  const origin = props.state.client?.origin ?? ORIGIN;
  const support = project?.support;

  useHead({
    title: project ? `Support — ${project.name}` : "Support",
    meta: [
      {
        name: "description",
        content: project ? `Help, answers and contact for ${project.name}.` : "",
      },
    ],
    link: project ? [{ rel: "canonical", href: `${origin}/${project.slug}/support` }] : [],
  });

  if (!project || !support) return null;

  const facts = [
    { label: "Platforms", value: support.platforms.join(" · ") },
    support.version ? { label: "Version", value: support.version } : undefined,
    support.requires ? { label: "Requires", value: support.requires } : undefined,
    support.price ? { label: "Price", value: support.price } : undefined,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <ProjectShell project={project} tab="support">
      <Prose title="Getting help" className="mb-3">
        {`Everything you might need for ${project.name} is on this page — the specs, the answers people ask for most, the fixes for when something is off, and a direct line when none of them fit.`}
      </Prose>

      {/* Contact next: someone who scrolled past the intro usually wants a human. */}
      <a
        href={`mailto:${support.contactEmail}?subject=${encodeURIComponent(project.name)}`}
        onClick={() => playSound("tap")}
        className="card card-hover flex items-center gap-4 rounded-[1.25rem] p-5"
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-[0.75rem] bg-ink text-canvas"
        >
          <Mail className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{support.contactEmail}</span>
          <span className="block text-sm text-ink-faint">
            No ticket system, no bot — replies {support.responseTime}.
          </span>
        </span>
      </a>

      <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="card rounded-[0.875rem] px-4 py-3">
            <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-ink-faint">
              {fact.label}
            </dt>
            <dd className="mt-1 text-sm font-medium leading-snug">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <Label>Common questions</Label>
        <div className="mt-5 space-y-2.5">
          {support.faq.map((entry) => (
            <FaqItem key={entry.question} question={entry.question} answer={entry.answer} />
          ))}
        </div>
      </section>

      {support.guides && support.guides.length > 0 && (
        <section className="mt-12">
          <Label>When something is off</Label>
          <div className="mt-5 space-y-3">
            {support.guides.map((guide) => (
              <Prose key={guide.title} title={guide.title}>{guide.body}</Prose>
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 text-sm text-ink-dim">
        Looking for how data is handled? That is on the{" "}
        <a
          href={`/${project.slug}/privacy`}
          client-nav="true"
          className="font-medium text-[var(--accent)] transition-opacity hover:opacity-75"
        >
          privacy page
        </a>.
      </p>
    </ProjectShell>
  );
}
