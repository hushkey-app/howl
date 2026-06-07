import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../howl.config.ts";
import { readProfile, readProjects } from "../../server/cv/reader.ts";
import { useHead } from "@hushkey/howl-react/head";

const ACCENT_TEXT: Record<string, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  accent: "text-accent",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
};

const ACCENT_BG_SOLID: Record<string, string> = {
  primary: "bg-primary/15",
  secondary: "bg-secondary/15",
  accent: "bg-accent/15",
  info: "bg-info/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
};

const PRINCIPLES: { kicker: string; title: string; body: string }[] = [
  {
    kicker: "01",
    title: "Earn it before we ship it",
    body:
      "Nothing on this page is theoretical. Every package was running in Hushkey before it got a JSR release. If it can't survive our own production, it doesn't belong in someone else's.",
  },
  {
    kicker: "02",
    title: "Pay the toolkit forward",
    body:
      "We didn't build this stack — Deno, Fresh, Preact, Redis, ioredis, esbuild, Tailwind. Software is our way of staying in net-positive standing with the toolkit we depend on.",
  },
  {
    kicker: "03",
    title: "Two halves, one rule",
    body:
      "Hushkey is the proprietary platform that pays for the studio. Software is the open surface. Keeping both alive forces honesty in both directions: the OSS has to be useful enough to leverage, the product has to be honest about its dependencies.",
  },
];

export default function About(props: ReactPageProps<unknown, State>) {
  const profile = readProfile();
  const projects = readProjects();
  const title = props.state.client?.title ?? "Software";
  const founder = profile.team[0];

  useHead({
    title: `About — ${title}`,
    meta: [
      {
        name: "description",
        content: `${profile.name} ${profile.studio} — why we open-source the tools we use.`,
      },
    ],
  });

  return (
    <>
      <div className="relative flex-1 bg-base-100 bg-dot-grid bg-size-[28px_28px] pt-24 sm:pt-32 pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          {/* Header — matches /projects */}
          <div className="mb-10 sm:mb-14">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-base-content/40 mb-2">
              {profile.studio}
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
              Why open-source<span className="text-primary">.</span>
            </h1>
            <p className="text-base sm:text-lg text-base-content/70 leading-relaxed max-w-2xl">
              The short version of how this site exists.
            </p>
          </div>

          {/* Inner content stays narrower for readability */}
          <div className="max-w-3xl">
            {/* The narrative — pulled from profile.about */}
            <div className="space-y-5 text-base sm:text-lg text-base-content/80 leading-relaxed mb-14 sm:mb-20">
              {profile.about.map((p, i) => (
                <p
                  key={i}
                  className={i === 0
                    ? "text-lg sm:text-xl text-base-content/90 leading-relaxed font-medium"
                    : ""}
                >
                  {p}
                </p>
              ))}
            </div>

            {/* Principles */}
            <div className="mb-14 sm:mb-20">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-base-content/60 font-bold mb-6">
                How we decide
              </p>
              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                {PRINCIPLES.map((p) => (
                  <div
                    key={p.kicker}
                    className="rounded-2xl border border-base-300 bg-base-200/60 backdrop-blur p-5 sm:p-6 flex gap-4 sm:gap-6"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary font-black mt-1 shrink-0">
                      {p.kicker}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight mb-1.5">
                        {p.title}
                      </h3>
                      <p className="text-sm sm:text-base text-base-content/70 leading-relaxed">
                        {p.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Receipts — what's currently live, kept dynamic */}
            <div className="mb-14 sm:mb-20">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-base-content/60 font-bold mb-6">
                Receipts
              </p>
              <div className="rounded-2xl border border-base-300 bg-base-200/60 backdrop-blur p-5 sm:p-6">
                <p className="text-sm text-base-content/60 mb-4 leading-relaxed">
                  Products in the studio right now:
                </p>
                <ul className="space-y-2">
                  {projects.map((p) => (
                    <li key={p.slug}>
                      <a
                        href={`/projects/${p.slug}`}
                        className="flex items-baseline justify-between gap-3 group"
                      >
                        <span className="flex items-baseline gap-2 min-w-0">
                          <span
                            className={`font-bold text-base sm:text-lg group-hover:underline truncate ${
                              ACCENT_TEXT[p.accent] ?? ACCENT_TEXT.primary
                            }`}
                          >
                            {p.title}
                          </span>
                          <span className="text-sm text-base-content/60 truncate">
                            — {p.tagline}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-base-content/40 shrink-0">
                          {p.status === "production"
                            ? "In production"
                            : p.status === "development"
                            ? "In dev"
                            : p.status === "shipped"
                            ? "Shipped"
                            : p.status}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* By — solo founder */}
            {founder && (
              <div className="mb-14 sm:mb-20">
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-base-content/60 font-bold mb-6">
                  By
                </p>
                <div className="rounded-2xl border border-base-300 bg-base-200/60 backdrop-blur p-6 sm:p-8 flex flex-col sm:flex-row gap-5 sm:gap-7">
                  <div
                    className={`w-20 h-20 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center font-mono font-black text-2xl shrink-0 ${
                      ACCENT_BG_SOLID[founder.accent] ?? ACCENT_BG_SOLID.primary
                    } ${ACCENT_TEXT[founder.accent] ?? ACCENT_TEXT.primary}`}
                  >
                    {founder.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold tracking-tight">
                      {founder.name}
                    </h2>
                    <p
                      className={`font-mono text-xs uppercase tracking-widest mt-1 mb-3 ${
                        ACCENT_TEXT[founder.accent] ?? ACCENT_TEXT.primary
                      }`}
                    >
                      {founder.role}
                    </p>
                    {founder.bio && (
                      <p className="text-base text-base-content/70 leading-relaxed mb-4">
                        {founder.bio}
                      </p>
                    )}
                    {founder.url && (
                      <a
                        href={founder.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm rounded-xl btn-ghost border border-base-300 hover:border-primary/50 hover:bg-primary/10 font-mono text-xs"
                      >
                        {founder.handle ?? "Profile"} ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Collab CTA */}
            <div className="rounded-3xl border border-primary/30 bg-linear-to-br from-primary/15 to-primary/5 p-6 sm:p-10 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-base-content/60 font-bold mb-3">
                Working with us
              </p>
              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                Solo for now — open to the right collaborators.
              </h3>
              <p className="text-base text-base-content/70 leading-relaxed max-w-xl mx-auto mb-6">
                If you've shipped Deno, TypeScript, mobile or infra at depth and want to work on
                tools the world actually uses — say hi.
              </p>
              <a
                href={`mailto:${profile.email}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-md rounded-xl font-bold"
              >
                {profile.email} →
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
