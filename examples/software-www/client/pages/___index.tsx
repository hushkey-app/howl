// import { useEffect } from "react";
import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../howl.config.ts";
import { type ProjectStatus, readProfile, readProjects } from "../../server/cv/reader.ts";

const ACCENT_RING: Record<string, string> = {
  primary: "ring-primary/30 hover:ring-primary/60",
  secondary: "ring-secondary/30 hover:ring-secondary/60",
  accent: "ring-accent/30 hover:ring-accent/60",
  info: "ring-info/30 hover:ring-info/60",
  success: "ring-success/30 hover:ring-success/60",
  warning: "ring-warning/30 hover:ring-warning/60",
};

const ACCENT_TEXT: Record<string, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  accent: "text-accent",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
};

const ACCENT_BG: Record<string, string> = {
  primary: "from-primary/20 to-primary/5",
  secondary: "from-secondary/20 to-secondary/5",
  accent: "from-accent/20 to-accent/5",
  info: "from-info/20 to-info/5",
  success: "from-success/20 to-success/5",
  warning: "from-warning/20 to-warning/5",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  shipped: "Shipped",
  production: "In production",
  development: "In dev",
  archived: "Archived",
};

function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === "production") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/25 border border-primary/40 px-2 py-0.5 rounded">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/70 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
        </span>
        {STATUS_LABEL[status]}
      </span>
    );
  }
  if (status === "development") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-info bg-info/25 border border-info/40 px-2 py-0.5 rounded">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-info/70 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-info" />
        </span>
        {STATUS_LABEL[status]}
      </span>
    );
  }
  if (status === "archived") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-widest text-base-content/40 bg-base-content/5 px-2 py-0.5 rounded">
        {STATUS_LABEL[status]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-success bg-success/25 border border-success/40 px-2 py-0.5 rounded">
      <svg
        className="w-2.5 h-2.5"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.41 0z"
          clipRule="evenodd"
        />
      </svg>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function Index(_props: ReactPageProps<unknown, State>) {
  const profile = readProfile();
  const projects = readProjects();

  useHead({
    title: `${profile.name} ${profile.studio} — ${profile.kicker}`,
    meta: [
      { name: "description", content: `${profile.name} ${profile.studio} — ${profile.tagline}` },
    ],
  });

  return (
    <>
      <div className="relative flex-1 bg-base-100 bg-dot-grid bg-size-[28px_28px] overflow-hidden">
        {/* Subtle ambient primary glow behind the hero */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-160 h-160 rounded-full bg-primary opacity-[0.07] blur-3xl" />
        </div>

        {/* HERO */}
        <section className="relative pt-24 sm:pt-28 sm:pb-6 px-5 sm:px-8 max-w-3xl mx-auto text-center">
          <div className="animate-fade-up-1 flex items-center justify-center mb-6 sm:mb-8">
            <img
              src="/logo.svg"
              alt={profile.name}
              className="w-28 h-28 sm:w-40 sm:h-40"
              style={{
                filter:
                  "drop-shadow(0 0 32px oklch(var(--p)/0.5)) drop-shadow(0 0 80px oklch(var(--p)/0.25))",
              }}
            />
          </div>

          <p className="animate-fade-up-2 font-mono text-[11px] sm:text-xs uppercase tracking-[0.3em] text-base-content/40 mb-3">
            {profile.kicker}
          </p>
          <h1 className="animate-fade-up-2 text-5xl sm:text-7xl font-bold tracking-tight leading-[0.95] mb-3">
            {profile.name.toUpperCase()}
            <span className="text-primary">.</span>
          </h1>
          <p className="animate-fade-up-2 font-mono text-sm sm:text-base text-base-content/50 mb-6 tracking-wider">
            {profile.studio}
          </p>
          <p className="animate-fade-up-3 text-lg sm:text-xl text-base-content/70 leading-relaxed max-w-xl mx-auto mb-8">
            {profile.tagline}
          </p>
        </section>

        {/* PRODUCTS */}
        <section
          id="products"
          className="relative max-w-5xl mx-auto px-5 sm:px-8 pb-8 sm:pb-12 scroll-mt-24"
        >
          <div className="flex items-baseline justify-between mb-6">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-base-content/60 font-bold">
              Products
            </p>
            <p className="font-mono text-[11px] uppercase tracking-widest text-base-content/40">
              {projects.length} products
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {projects.map((p) => (
              <a
                key={p.slug}
                href={`/projects/${p.slug}`}
                className={`group relative rounded-2xl border border-base-300 bg-base-200/60 backdrop-blur ring-1 ring-transparent transition-all overflow-hidden ${
                  ACCENT_RING[p.accent] ?? ACCENT_RING.primary
                }`}
              >
                <div
                  className={`absolute inset-0 bg-linear-to-br ${
                    ACCENT_BG[p.accent] ?? ACCENT_BG.primary
                  } opacity-50 group-hover:opacity-90 transition-opacity`}
                />
                <div className="relative p-5 flex flex-col gap-3 h-full">
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status={p.status} />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-base-content/40">
                      {p.year}
                    </span>
                  </div>
                  <div>
                    <h3
                      className={`text-xl font-bold tracking-tight transition-colors ${
                        ACCENT_TEXT[p.accent] ?? ACCENT_TEXT.primary
                      }`}
                    >
                      {p.title}
                    </h3>
                    <p
                      className={`font-mono text-[11px] uppercase tracking-widest mt-1 ${
                        ACCENT_TEXT[p.accent] ?? ACCENT_TEXT.primary
                      } opacity-70`}
                    >
                      {p.tagline}
                    </p>
                  </div>
                  <p className="text-sm text-base-content/70 leading-relaxed line-clamp-3 flex-1">
                    {p.description}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-base-300/60">
                    <span
                      className={`font-mono text-xs font-bold transition-colors ${
                        ACCENT_TEXT[p.accent] ?? ACCENT_TEXT.primary
                      } group-hover:underline`}
                    >
                      Read more
                    </span>
                    <span className="text-base-content/30 group-hover:text-base-content text-base transition-all group-hover:translate-x-0.5">
                      →
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
