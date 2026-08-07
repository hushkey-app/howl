import { useHead } from "@hushkey/howl-react/head";
import { ArrowUpRight } from "lucide-react";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { useMagneticTilt } from "@/lib/motion.ts";
import { playSound } from "@/lib/sound.ts";
import { Label } from "@/components/ui/chip.tsx";
import { Portrait } from "@/components/portrait.tsx";
import { ProjectGrid } from "@/components/project-grid.tsx";
import { ROLES } from "../../shared/cv.ts";
import { EMAIL, LOCATION, NAME, ORIGIN, ROLE, SOCIALS } from "../../shared/profile.ts";

/** The home page: who, what he has made, where he has worked, how to reach him. */
export default function Home(props: ReactPageProps<unknown, State>) {
  const portraitRef = useMagneticTilt<HTMLDivElement>(14, 420);
  const origin = props.state.client?.origin ?? ORIGIN;
  const description =
    `${NAME} — ${ROLE.toLowerCase()} in ${LOCATION}, a decade in. Backend systems, distributed infrastructure and full-stack TypeScript.`;

  useHead({
    title: `${NAME} — ${ROLE}`,
    meta: [
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: `${NAME} — ${ROLE}` },
      { property: "og:description", content: description },
      { property: "og:url", content: origin },
    ],
    link: [{ rel: "canonical", href: origin }],
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-5">
      {/* ------------------------------------------------------------- intro */}
      <section className="flex flex-col items-center pb-4 pt-32 text-center sm:pt-36">
        <div className="rise [perspective:600px]">
          <div
            ref={portraitRef}
            className="[transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] transition-transform duration-200 ease-out will-change-transform"
          >
            <Portrait className="size-20" monogramClassName="text-xl" />
          </div>
        </div>

        <h1
          className="rise mt-6 text-3xl font-semibold tracking-tight sm:text-4xl"
          style={{ animationDelay: "0.06s" }}
        >
          {NAME}
        </h1>
        <p
          className="rise mt-1.5 text-[0.7rem] uppercase tracking-[0.2em] text-ink-faint"
          style={{ animationDelay: "0.1s" }}
        >
          {ROLE}
        </p>

        <div
          className="rise mt-7 space-y-4 text-ink-dim"
          style={{ animationDelay: "0.16s" }}
        >
          <p>
            A decade building the layer under the product — frameworks, queues, auth and the
            infrastructure that holds up when the traffic is real.
          </p>
          <p>
            Based in Perth, working at Hushkey. Low-dependency by choice: most of what I ship, I own
            end to end.
          </p>
        </div>

        <div
          className="rise mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm"
          style={{ animationDelay: "0.22s" }}
        >
          {SOCIALS.map((social) => (
            <a
              key={social.href}
              href={social.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => playSound("tap")}
              className="group inline-flex items-center gap-1 text-ink-dim transition-colors hover:text-ink"
            >
              {social.label}
              <ArrowUpRight className="size-3.5 text-ink-faint transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- projects */}
      <section id="projects" className="scroll-mt-24 pt-20">
        <Label>Projects</Label>
        <div className="mt-5">
          <ProjectGrid />
        </div>
      </section>

      {/* -------------------------------------------------------- experience */}
      <section id="experience" className="scroll-mt-24 pt-20">
        <Label>Experience</Label>

        <div className="card mt-5 rounded-[1.5rem] p-5 sm:p-6">
          <ol className="divide-y divide-[color:var(--hairline)]">
            {ROLES.map((role) => (
              <li
                key={`${role.company}-${role.period}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {role.href
                      ? (
                        <a
                          href={role.href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => playSound("tap")}
                          className="inline-flex items-center gap-1 transition-opacity hover:opacity-70"
                        >
                          {role.company}
                          <ArrowUpRight className="size-3.5 text-ink-faint" />
                        </a>
                      )
                      : role.company}
                  </p>
                  <p className="text-sm text-ink-dim">{role.title}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-faint">{role.period}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- contact */}
      <section id="contact" className="scroll-mt-24 pt-20">
        <Label>Reach out</Label>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <a
            href={`mailto:${EMAIL}`}
            onClick={() => playSound("tap")}
            className="card card-hover flex items-center justify-between gap-3 rounded-[1.25rem] px-5 py-4"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">Email</span>
              <span className="block truncate text-xs text-ink-faint">{EMAIL}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-ink-faint" />
          </a>

          {SOCIALS.map((social) => (
            <a
              key={social.href}
              href={social.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => playSound("tap")}
              className="card card-hover flex items-center justify-between gap-3 rounded-[1.25rem] px-5 py-4"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{social.label}</span>
                <span className="block truncate text-xs text-ink-faint">{social.handle}</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-ink-faint" />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
