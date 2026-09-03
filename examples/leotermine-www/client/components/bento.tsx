import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight, Moon, Volume2, Waves } from "lucide-react";
import { useRevealOnce } from "@/lib/motion.ts";
import { playSound } from "@/lib/sound.ts";
import { usePref } from "@/lib/motion.ts";
import { togglePref } from "@/lib/prefs.ts";
import { useTheme } from "@/lib/motion.ts";
import { toggleTheme } from "@/lib/theme.ts";
import { cn } from "@/lib/utils.ts";
import { SKILLS } from "../../shared/cv.ts";
import { PROJECTS } from "../../shared/projects/index.ts";
import type { Project } from "../../shared/projects/types.ts";
import { EMAIL, NAME, ROLE, SOCIALS } from "../../shared/profile.ts";

/**
 * The whole site as one summary board.
 *
 * Name and introduction sit in the middle and everything else is packed around
 * them: what he has built, where he has worked, the numbers behind it, and how
 * to get hold of him in the bottom-right corner. Tile size is editorial — the
 * current role and the shipped products get room, a two-year contract gets a
 * square — and `grid-auto-flow: dense` closes the gaps the centre tile leaves.
 *
 * Every tile rests showing an identity and reveals its evidence on hover. The
 * detail stays in the DOM so it reaches a screen reader with no pointer, and
 * tiles are focusable so the reveal works from the keyboard.
 */
export function Bento() {
  const litRef = useRevealOnce<HTMLDivElement>();

  const project = (slug: string) => PROJECTS.find((p) => p.slug === slug)!;

  let order = 0;
  const next = () => order++;

  return (
    <div ref={litRef} className="bento">
      {/* First in reading order for mobile; the desktop grid pins it centrally. */}
      <IntroTile index={next()} />

      <ProjectTile project={project("howl")} index={next()} span="t-wide" id="projects" />
      <ProjectTile project={project("pack")} index={next()} span="t-wide" />
      <ProjectTile project={project("hushkey")} index={next()} span="t-wide" />

      <ProjectTile project={project("guard")} index={next()} span="t-wide" />
      <ProjectTile project={project("nobiru")} index={next()} span="t-sm" />
      <ThemeTile index={next()} />

      <ProjectTile project={project("rustydeck")} index={next()} span="t-wide" />
      <SwitchTile
        index={next()}
        pref="wave"
        hue={196}
        icon={<Waves className="size-5" />}
        label="Wave"
        on="Drifting"
        off="Still"
      />
      <SwitchTile
        index={next()}
        pref="sound"
        hue={32}
        icon={<Volume2 className="size-5" />}
        label="Sound"
        on="Audible"
        off="Muted"
      />

      <ProjectTile project={project("nanoleaf-pegboard")} index={next()} span="t-wide" />
      <ProjectTile project={project("hound")} index={next()} span="t-wide" />

      {/* Bottom-right corner: the way off the board. */}
      <ContactTile
        index={next()}
        id="contact"
        label="Email"
        value={EMAIL}
        href={`mailto:${EMAIL}`}
        hue={268}
      />
      {SOCIALS.map((social) => (
        <ContactTile
          key={social.href}
          index={next()}
          label={social.label}
          value={social.handle}
          href={social.href}
          external
          hue={196}
        />
      ))}
    </div>
  );
}

/** Name and the two sentences that frame everything else on the board. */
function IntroTile({ index }: { index: number }) {
  return (
    <section
      data-tile
      style={{ "--i": index, "--tile-hue": 268 } as CSSProperties}
      className="tile t-intro justify-center"
    >
      <h1 className="text-[clamp(1.75rem,2.4vw,2.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
        {NAME}
      </h1>
      <p className="mt-1.5 text-[0.9375rem] text-ink-dim">{ROLE}, Perth</p>

      <div className="intro-copy text-[0.875rem] leading-relaxed text-ink-dim">
        <p>
          A decade building the layer under the product — frameworks, queues, auth and the
          infrastructure that holds up when the traffic is real.
        </p>
        <p>Low-dependency by choice: most of what I ship, I own end to end.</p>
      </div>

      <ul className="skills">
        {SKILLS.map((skill, i) => (
          <li key={skill.label} className="skill">
            <span className="skill-name">{skill.label}</span>
            {
              /* Decoration: the value sits beside it as real text, so a screen
                reader gets the number without announcing the bar twice. */
            }
            <span className="skill-track" aria-hidden="true">
              <span
                className="skill-fill"
                style={{ "--v": skill.value / 100, "--n": i } as CSSProperties}
              />
            </span>
            <span className="skill-value">{skill.value}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A shipped thing. The cover fills the tile the way a product shot fills
 * Apple's; projects with no public site show their icon on the accent rather
 * than a faked screenshot.
 *
 * Hover lifts the tile, eases the cover in a little, and brings the project's
 * real links forward. There is no description plane: the summary is one click
 * away on the project's own page, and swapping a block of prose in and out
 * under the cursor cost more to paint than it was worth reading.
 *
 * The whole tile is clickable through a stretched link behind the actions, so
 * the action links stay real links instead of being nested inside another one.
 */
function ProjectTile(
  { project, index, span, id }: {
    project: Project;
    index: number;
    span: string;
    id?: string;
  },
) {
  return (
    <article
      id={id}
      data-tile
      style={{ "--i": index, "--tile-hue": project.hue } as CSSProperties}
      className={cn("tile tile-reveal tile-media !p-0", span)}
      onPointerEnter={() => playSound("hover")}
    >
      {project.cover
        ? (
          <img
            src={project.cover}
            alt=""
            width={1200}
            height={750}
            decoding="async"
            className="tile-cover"
          />
        )
        : (
          <span className="tile-wash" aria-hidden="true">
            {project.icon
              ? (
                <img
                  src={project.icon}
                  alt=""
                  width={256}
                  height={256}
                  decoding="async"
                  className="size-14 rounded-[1rem]"
                />
              )
              : (
                <span className="text-3xl font-semibold text-[var(--accent)]">
                  {project.name.charAt(0)}
                </span>
              )}
          </span>
        )}

      <a
        href={`/${project.slug}`}
        onClick={() => playSound("tap")}
        className="tile-stretch"
        aria-label={`${project.name} — ${project.tagline}`}
      />

      {project.links.length > 0 && (
        <div className="tile-actions">
          {project.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => playSound("tap")}
              className="tile-action"
            >
              {link.label}
              <ArrowUpRight className="size-3.5" />
            </a>
          ))}
        </div>
      )}

      <span className="tile-caption">
        <span className="block font-semibold tracking-tight">{project.name}</span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-dim">
          {project.tagline}
        </span>
      </span>
    </article>
  );
}

/** A way to reach him. These close the board out, bottom-right. */
function ContactTile(
  { index, label, value, href, external, hue, id }: {
    index: number;
    label: string;
    value: string;
    href: string;
    external?: boolean;
    hue: number;
    id?: string;
  },
) {
  return (
    <a
      id={id}
      data-tile
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      onClick={() => playSound("tap")}
      style={{ "--i": index, "--tile-hue": hue } as CSSProperties}
      className="tile tile-reveal t-sm justify-center"
      onPointerEnter={() => playSound("hover")}
    >
      <ArrowUpRight className="absolute right-4 top-4 size-4 text-ink-faint" />
      <span className="block font-semibold tracking-tight">{label}</span>
      <span className="mt-0.5 block truncate text-[0.8125rem] text-ink-dim">{value}</span>
    </a>
  );
}

/**
 * A switch, sized like every other small tile.
 *
 * The state is the tile: the icon lights in the accent and the track fills when
 * it is on, so the answer to "is this on?" is readable without finding a knob.
 * It is a real `role="switch"`, so a screen reader announces it as one.
 */
function SwitchTile(
  { index, pref, hue, icon, label, on, off }: {
    index: number;
    pref: "wave" | "sound";
    hue: number;
    icon: ReactNode;
    label: string;
    /** Word shown while the switch is on. */
    on: string;
    /** Word shown while it is off. */
    off: string;
  },
) {
  const active = usePref(pref);

  return (
    <button
      type="button"
      data-tile
      role="switch"
      aria-checked={active}
      aria-label={label}
      onClick={() => {
        // Flip first: turning sound back on should be audible, turning it off silent.
        togglePref(pref);
        playSound("tap");
      }}
      style={{ "--i": index, "--tile-hue": hue } as CSSProperties}
      className={cn("tile tile-reveal t-sm justify-center text-left", active && "is-on")}
    >
      <span className="switch-icon">{icon}</span>

      <span className="mt-4 block">
        <span className="block font-semibold tracking-tight">{label}</span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="switch-track" aria-hidden="true">
            <span className="switch-knob" />
          </span>
          <span className="text-[0.8125rem] text-ink-dim">{active ? on : off}</span>
        </span>
      </span>
    </button>
  );
}

/** The palette switch. Same tile as the others; the theme is its own store. */
function ThemeTile({ index }: { index: number }) {
  const dark = useTheme() === "dark";

  return (
    <button
      type="button"
      data-tile
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      onClick={() => {
        playSound("tap");
        toggleTheme();
      }}
      style={{ "--i": index, "--tile-hue": 268 } as CSSProperties}
      className={cn("tile tile-reveal t-sm justify-center text-left", dark && "is-on")}
    >
      <span className="switch-icon">
        <Moon className="size-5" />
      </span>

      <span className="mt-4 block">
        <span className="block font-semibold tracking-tight">Dark</span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="switch-track" aria-hidden="true">
            <span className="switch-knob" />
          </span>
          <span className="text-[0.8125rem] text-ink-dim">{dark ? "On" : "Off"}</span>
        </span>
      </span>
    </button>
  );
}
