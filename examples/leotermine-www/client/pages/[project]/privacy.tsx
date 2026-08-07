import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { ProjectShell, Prose } from "@/components/project-shell.tsx";
import { getProject } from "../../../shared/projects/index.ts";
import { ORIGIN } from "../../../shared/profile.ts";

const DATE_FORMAT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Privacy policy for a hosted app, rendered from the project's
 * `support.privacy` sections — so the policy is reviewed in one data file
 * rather than edited inside JSX.
 */
export default function ProjectPrivacy(props: ReactPageProps<unknown, State>) {
  const project = getProject(props.params?.project as string | undefined);
  const origin = props.state.client?.origin ?? ORIGIN;
  const support = project?.support;

  useHead({
    title: project ? `Privacy — ${project.name}` : "Privacy",
    meta: [
      { name: "description", content: project ? `How ${project.name} handles your data.` : "" },
    ],
    link: project ? [{ rel: "canonical", href: `${origin}/${project.slug}/privacy` }] : [],
  });

  if (!project || !support) return null;

  return (
    <ProjectShell project={project} tab="privacy">
      <div className="space-y-3">
        <Prose title="About this policy">
          <p>
            {`How ${project.name} handles your data — in plain language, matching what the app actually does. Each section below covers one thing the app touches.`}
          </p>
          <p className="mt-2 text-ink-faint">
            Last updated {DATE_FORMAT.format(new Date(`${support.privacyUpdated}T00:00:00Z`))}
          </p>
        </Prose>

        {support.privacy.map((section) => (
          <Prose key={section.title} title={section.title}>{section.body}</Prose>
        ))}
      </div>

      <p className="mt-8 text-sm text-ink-dim">
        Questions about any of this:{" "}
        <a
          href={`mailto:${support.contactEmail}`}
          className="font-medium text-[var(--accent)] transition-opacity hover:opacity-75"
        >
          {support.contactEmail}
        </a>
      </p>
    </ProjectShell>
  );
}
