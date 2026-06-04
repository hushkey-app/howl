import { useHead } from "@hushkey/howl-react/head";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../howl.config.ts";

/** The one command to start a Howl project — the page's primary call to action. */
const SCAFFOLD_CMD = "deno run -Ar jsr:@hushkey/howl-init";
const DOCS_URL = "/docs";
const GITHUB_URL = "https://github.com/hushkey-app/howl";
const JSR_URL = "https://jsr.io/@hushkey/howl";

/** The render engines shown in the §4 IDE panel switcher. */
type Engine = "react" | "vue" | "text";

const ENGINES: { id: Engine; label: string }[] = [
  { id: "react", label: "React" },
  { id: "vue", label: "Vue" },
  { id: "text", label: "Your own" },
];

/** Each engine's `main.ts` — the core ships no renderer; you register one. */
const ENGINE_CODE: Record<Engine, string> = {
  react: `import { defineConfig } from "@hushkey/howl";
import { reactEngine } from "@hushkey/howl-react";
// Core ships no renderer. Register an engine
// and it owns the whole response (react-dom/server).
export default defineConfig({
  engines: { react: reactEngine() },
});`,
  vue: `import { defineConfig } from "@hushkey/howl";
import { vueEngine } from "@hushkey/howl-vue";
// Same core, swap the package.
// Renders with vue/server-renderer.
export default defineConfig({
  engines: { vue: vueEngine() },
});`,
  text: `import { defineConfig } from "@hushkey/howl";
import type { RenderEngine } from "@hushkey/howl";
// The seam is one method — total control.
const text: RenderEngine = {
  render: (ctx, opts) => ctx.html(String(opts.data)),
};
export default defineConfig({ engines: { text } });`,
};

const ENGINE_PKG: Record<Engine, string> = {
  react: "@hushkey/howl-react",
  vue: "@hushkey/howl-vue",
  text: "(your module)",
};

const RENDER_MODES: { file: string; mode: string; paint: string; nav: string }[] = [
  {
    file: "index.tsx",
    mode: "SSR",
    paint: "Rendered every request",
    nav: "Partial-fragment fetch",
  },
  {
    file: "__index.tsx",
    mode: "AOT",
    paint: "Rendered every request",
    nav: "Dynamic-import chunk, no server",
  },
  {
    file: "___index.tsx",
    mode: "SSG",
    paint: "Prerendered HTML snapshot",
    nav: "Dynamic-import chunk, no server",
  },
];

/** Small accent icon for a feature card. */
function Icon({ path }: { path: string }) {
  return (
    <svg
      className="h-4.5 w-4.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const FEATURES: { title: string; icon: string; body: ReactNode }[] = [
  {
    title: "Typed endpoints + Zod",
    icon: "M8 9l-3 3 3 3m8-6l3 3-3 3M13.5 6l-3 12",
    body: (
      <>
        <code className="text-primary">defineApi</code>{" "}
        gives fully typed query, body, params, and responses. Validated in a WeakMap.
      </>
    ),
  },
  {
    title: "Headers → every response",
    icon: "M12 4v12m0 0l-4-4m4 4l4-4M5 20h14",
    body: (
      <>
        <code className="text-primary">ctx.headers.set()</code>{" "}
        in middleware propagates to page renders, not just API responses.
      </>
    ),
  },
  {
    title: "Native cookies on ctx",
    icon:
      "M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-4-4 .9.9 0 0 0-1-1zM8.5 13h.01M13 16h.01M15 10h.01",
    body: (
      <>
        <code className="text-primary">ctx.cookies</code>{" "}
        get / set / delete — append semantics preserved across the whole middleware stack.
      </>
    ),
  },
  {
    title: "Auto-generated OpenAPI",
    icon: "M7 3h7l5 5v13a0 0 0 0 1 0 0H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M9 13h6M9 17h6",
    body: (
      <>
        <code className="text-primary">getApiSpecs()</code>{" "}
        returns a live OpenAPI 3.1 doc — query params, roles, responses included.
      </>
    ),
  },
  {
    title: "Built-in RBAC",
    icon: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z",
    body: (
      <>
        One <code className="text-primary">checkPermissionStrategy</code> in{" "}
        <code className="text-primary">defineConfig</code> — typed roles, no middleware noise.
      </>
    ),
  },
  {
    title: "Bring your own view",
    icon: "M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5",
    body: (
      <>
        React or Vue out of the box, or write your own engine. The core renders nothing itself.
      </>
    ),
  },
];

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "type",
  "new",
  "return",
]);

/** Lightweight TS syntax highlighting for the IDE panel code samples. */
function highlightLine(line: string): ReactNode {
  if (line.trimStart().startsWith("//")) {
    return <span className="text-ink-3">{line}</span>;
  }
  const out: ReactNode[] = [];
  const re = /("[^"]*")|([A-Za-z_$][A-Za-z0-9_$]*)|([{}()<>;:,.=]+)|(\s+)/g;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    const [tok, str, ident, punct] = m;
    if (str) {
      out.push(<span key={key++} className="text-success">{tok}</span>);
    } else if (ident) {
      if (KEYWORDS.has(ident)) {
        out.push(<span key={key++} className="font-semibold text-primary">{tok}</span>);
      } else if (/^[A-Z]/.test(ident)) {
        out.push(<span key={key++} className="text-magenta">{tok}</span>);
      } else if (line[re.lastIndex] === "(") {
        out.push(<span key={key++} className="text-info">{tok}</span>);
      } else {
        out.push(<span key={key++} className="text-ink">{tok}</span>);
      }
    } else if (punct) {
      out.push(<span key={key++} className="text-ink-3">{tok}</span>);
    } else {
      out.push(<span key={key++}>{tok}</span>);
    }
  }
  return out;
}

/** Reveal `[data-reveal]` elements as they scroll into view (reduced-motion safe). */
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in globalThis)) {
      els.forEach((el) => el.classList.add("revealed"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/** Editorial section header — mono index, tag, hairline rule, then the H2. */
function SectionHeader(
  { index, tag, title }: { index: string; tag: string; title: ReactNode },
) {
  return (
    <div data-reveal>
      <div className="flex items-center gap-4">
        <span className="font-mono text-[13px] font-bold text-primary">{index}</span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-ink-3">
          {tag}
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <h2 className="mt-4 font-mono text-[1.9rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}

/** A filename with its render-mode prefix underscores accented. */
function ModeFile({ file }: { file: string }) {
  const [, prefix, rest] = file.match(/^(_*)(.*)$/)!;
  return (
    <code className="font-mono text-[15px] font-bold text-ink">
      {prefix && <span className="text-magenta">{prefix}</span>}
      {rest}
    </code>
  );
}

/**
 * The dark install bar — the `howl-init` scaffold command, click-to-copy.
 * Reused in the hero and the closing CTA.
 */
function InstallBar() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(SCAFFOLD_CMD)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {});
  };
  return (
    <div className="overflow-hidden rounded-xl border border-ink/30 bg-ink shadow-[0_18px_40px_-20px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-magenta/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
        <span className="ml-2 font-mono text-[11px] uppercase tracking-widest text-white/40">
          new project
        </span>
        <button
          type="button"
          onClick={copy}
          className="ml-auto font-mono text-[11px] text-white/45 transition-colors hover:text-yellow"
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy the scaffold command"
        className="flex w-full cursor-pointer flex-wrap items-center gap-2.5 px-5 py-4 text-left font-mono text-[14px] transition-colors hover:bg-white/5 sm:text-[15px]"
      >
        <span className="select-none text-magenta">$</span>
        <span className="text-white/90">deno run -Ar</span>
        <span className="font-semibold text-yellow">jsr:@hushkey/howl-init</span>
      </button>
    </div>
  );
}

/** Husky mascot card — the asymmetric hero's right column. */
function HuskyCard() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* layered halo */}
      <div className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-magenta/20 blur-3xl" />
      <div className="pointer-events-none absolute -inset-4 -z-10 translate-x-6 rounded-full bg-primary/15 blur-3xl" />
      <div className="howl-float relative rounded-3xl border border-line bg-paper p-8 shadow-[0_30px_70px_-28px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]">
        <span className="absolute left-4 top-4 rounded-full border border-line bg-accent-soft px-2.5 py-1 font-mono text-[10px] font-bold text-primary">
          Fresh-forked
        </span>
        <div className="flex flex-col items-center gap-3 py-4">
          <img src="/logo.svg" alt="Howl mascot" className="h-46 w-46 drop-shadow-xl" />
          <span className="font-mono text-sm font-bold tracking-[0.3em] text-ink-3">
            awooo~
          </span>
        </div>
        <span className="absolute bottom-4 right-4 rounded-lg border border-ink/30 bg-ink px-2.5 py-1 font-mono text-[10px] text-white/80">
          → deno task dev
        </span>
      </div>
    </div>
  );
}

/** A `main.ts` sample rendered like a real editor — gutter line numbers + caret. */
function CodeEditor({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <div className="flex overflow-x-auto bg-code-bg font-mono text-[12.5px] leading-[1.8]">
      <div
        aria-hidden="true"
        className="select-none border-r border-line/70 px-3 py-4 text-right text-ink-3/50"
      >
        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <pre className="flex-1 px-4 py-4">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre">
            {line ? highlightLine(line) : " "}
            {i === lines.length - 1 && (
              <span className="howl-cursor ml-0.5 text-primary">▍</span>
            )}
          </div>
        ))}
      </pre>
    </div>
  );
}

/** The §4 IDE panel — core file tree + editor + engine segmented control. */
function ViewLayerPanel() {
  const [engine, setEngine] = useState<Engine>("react");

  return (
    <div
      data-reveal
      className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_40px_90px_-50px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]"
    >
      {/* Title bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-base-100/60 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-magenta/60" />
          <span className="h-3 w-3 rounded-full bg-yellow/70" />
          <span className="h-3 w-3 rounded-full bg-line-2" />
        </div>
        <span className="font-mono text-[12px] text-ink-3">howl · my-app</span>
        <div
          role="tablist"
          aria-label="Render engine"
          className="ml-auto flex items-center gap-0.5 rounded-lg border border-line bg-base-100 p-0.5"
        >
          {ENGINES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={engine === id}
              onClick={() => setEngine(id)}
              className={`rounded-md px-2.5 py-1 font-mono text-[12px] transition-all ${
                engine === id
                  ? "bg-primary text-primary-content shadow-sm"
                  : "text-ink-2 hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body: sidebar + editor */}
      <div className="grid min-[940px]:grid-cols-[212px_1fr]">
        {/* File tree — hidden ≤940px */}
        <aside className="hidden border-r border-line bg-base-100/40 p-3 font-mono text-[12px] min-[940px]:block">
          <p className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-ink-3">
            Core · renders nothing
          </p>
          <ul className="mb-3 space-y-0.5 text-ink-3">
            <li className="flex items-center justify-between rounded px-2 py-1">
              engine.ts
              <span className="rounded bg-magenta-soft px-1.5 text-[9px] font-bold text-magenta ring-1 ring-magenta/20">
                seam
              </span>
            </li>
            <li className="rounded px-2 py-1">segments.ts</li>
            <li className="rounded px-2 py-1">context.ts</li>
          </ul>
          <p className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-ink-3">
            Your app
          </p>
          <ul className="mb-3 space-y-0.5 text-ink-2">
            <li className="rounded bg-accent-soft px-2 py-1 font-semibold text-primary">
              main.ts
            </li>
            <li className="rounded px-2 py-1">routes/index.tsx</li>
          </ul>
          <p className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-ink-3">
            Engine · JSR
          </p>
          <ul className="space-y-0.5 text-ink-2">
            <li className="truncate rounded px-2 py-1 text-magenta">{ENGINE_PKG[engine]}</li>
          </ul>
        </aside>

        {/* Editor */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b border-line bg-base-100/40 px-4 py-2">
            <span className="rounded-t-md border-b-2 border-primary px-2 py-1 font-mono text-[12px] text-ink">
              ● main.ts
            </span>
          </div>
          <CodeEditor code={ENGINE_CODE[engine]} />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-primary px-4 py-2 font-mono text-[11px] text-primary-content">
        <span className="flex items-center gap-1.5">
          <span className="howl-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-success" />
          Deno 2.x
        </span>
        <span>engine: {engine}</span>
        <span className="opacity-80 min-[720px]:ml-auto">
          core renders nothing — the engine owns the response
        </span>
      </div>
    </div>
  );
}

export default function Index(props: ReactPageProps<unknown, State>) {
  const version = props.state.client?.version ?? "";
  useReveal();

  const tagline =
    "Howl is the backend-first Deno framework: routing, validated APIs, middleware that reaches every response, RBAC, WebSockets & SSE. Forked from Fresh 2.x with Preact and islands removed — the core renders nothing, so rendering is a pluggable engine. No Vite.";

  useHead({
    title: "Howl — Backend-first Deno framework",
    meta: [
      { name: "description", content: tagline },
      { property: "og:title", content: "Howl — Backend-first Deno framework" },
      { property: "og:description", content: tagline },
      { property: "og:image", content: "https://howl.hushkey.dev/og.png" },
      { property: "og:url", content: "https://howl.hushkey.dev" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Howl — Backend-first Deno framework" },
      { name: "twitter:description", content: tagline },
      { name: "twitter:image", content: "https://howl.hushkey.dev/og.png" },
    ],
  });

  return (
    <div className="relative overflow-hidden bg-base-100">
      {/* Atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-dot-grid bg-size-[28px_28px]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-176 w-176 -translate-x-1/2 rounded-full bg-primary opacity-[0.08] blur-3xl" />
        <div className="absolute top-[26%] -right-52 h-136 w-136 rounded-full bg-magenta opacity-[0.07] blur-3xl" />
        <div className="absolute bottom-[6%] -left-52 h-136 w-136 rounded-full bg-accent opacity-[0.06] blur-3xl" />
        <div className="absolute inset-0 bg-grain opacity-[0.04] mix-blend-multiply" />
      </div>

      <main className="relative mx-auto max-w-285 px-5 pt-24 sm:px-9 sm:pt-32">
        {/* ── Hero ───────────────────────────────────────────── */}
        <section className="grid items-center gap-12 min-[940px]:grid-cols-[1.12fr_0.88fr]">
          <div className="order-2 animate-fade-up-1 min-[940px]:order-1">
            <p className="mb-5 flex flex-wrap items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-primary">
                v{version}
              </span>
              <span>Backend-first · Deno · No Vite</span>
            </p>
            <h1 className="font-mono text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-ink sm:text-[4rem]">
              Typed endpoints.<br />
              <em className="text-primary">Zero plumbing.</em>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-2 sm:text-base">
              Howl is the backend-first Deno framework: routing, validated APIs, middleware that
              reaches every response, RBAC, WebSockets & SSE. Forked from{" "}
              <strong className="font-semibold text-ink">Fresh 2.x</strong> with{" "}
              <strong className="font-semibold text-ink">Preact and islands removed</strong>{" "}
              — the core renders nothing, so rendering is a pluggable engine. No Vite.
            </p>

            <div className="mt-7 max-w-lg">
              <InstallBar />
              <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-widest text-ink-3">
                No install · Pick a template · deno task dev
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 min-[720px]:flex-row">
              <a
                href={DOCS_URL}
                className="group inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-6 py-3 font-mono text-[14px] font-bold text-primary-content shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
              >
                Read the docs{" "}
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-line-2 bg-paper px-6 py-3 font-mono text-[14px] font-semibold text-ink-2 transition-colors hover:border-primary hover:text-primary"
              >
                GitHub ↗
              </a>
              <a
                href={JSR_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-line-2 bg-paper px-6 py-3 font-mono text-[14px] font-semibold text-ink-2 transition-colors hover:border-primary hover:text-primary"
              >
                JSR ↗
              </a>
            </div>
          </div>

          <div className="order-1 animate-fade-up-3 min-[940px]:order-2">
            <HuskyCard />
          </div>
        </section>

        {/* ── Trust strip ────────────────────────────────────── */}
        <section
          data-reveal
          className="mt-16 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-y border-line py-5 text-center font-mono text-[12px] text-ink-3"
        >
          <span className="font-semibold text-ink-2">Single JSR package</span>
          <span className="text-line-2">·</span>
          <span>Deno 2.x / Zod 4 / esbuild 0.25</span>
          <span className="text-line-2">·</span>
          <span>~177 tests</span>
          <span className="text-line-2">·</span>
          <span>MIT</span>
        </section>

        {/* ── 01 · Rendering is a package ────────────────────── */}
        <section className="mt-24">
          <div className="mb-7 max-w-2xl">
            <SectionHeader
              index="01"
              tag="Core renders nothing"
              title={
                <>
                  Rendering is a <em className="text-primary">package</em>, not the core.
                </>
              }
            />
            <p data-reveal className="mt-4 text-[15px] leading-relaxed text-ink-2">
              Howl's core is routing, middleware, context and one render seam — the{" "}
              <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[13px] text-primary">
                RenderEngine
              </code>{" "}
              interface, types only. Register an engine package, write your own, or return data and
              the core falls back to{" "}
              <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[13px] text-primary">
                ctx.json()
              </code>.
            </p>
          </div>
          <ViewLayerPanel />
        </section>

        {/* ── 02 · Rendering modes ───────────────────────────── */}
        <section className="mt-24">
          <div className="mb-7 max-w-2xl">
            <SectionHeader
              index="02"
              tag="One file · One prefix"
              title={
                <>
                  Choose <em className="text-primary">when</em> each route renders.
                </>
              }
            />
            <p data-reveal className="mt-4 text-[15px] leading-relaxed text-ink-2">
              A filename prefix sets the route's render mode — the engine does the rendering, the
              core decides when. No config; rename the file and Howl does the rest.
            </p>
          </div>

          <div className="grid gap-4 min-[940px]:grid-cols-3">
            {RENDER_MODES.map(({ file, mode, paint, nav }, i) => (
              <div
                key={file}
                data-reveal
                style={{ transitionDelay: `${i * 80}ms` }}
                className="group rounded-2xl border border-line bg-paper p-5 transition-all duration-200 hover:-translate-y-[3px] hover:border-primary hover:shadow-[0_18px_40px_-24px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]"
              >
                <div className="flex items-center justify-between">
                  <ModeFile file={file} />
                  <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-black tracking-widest text-primary">
                    {mode}
                  </span>
                </div>
                <dl className="mt-4 space-y-2.5 text-[13px]">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-3">
                      First paint
                    </dt>
                    <dd className="text-ink-2">{paint}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-3">
                      Client nav
                    </dt>
                    <dd className="text-ink-2">{nav}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <p data-reveal className="mt-4 text-[13px] leading-relaxed text-ink-3">
            Opt in to client nav with{" "}
            <code className="rounded bg-base-200 px-1.5 py-0.5 font-mono text-[12px] text-ink-2">
              {"<body client-nav client-prefetch>"}
            </code>{" "}
            — prefetch on hover, touch, or focus.
          </p>
        </section>

        {/* ── 03 · What makes Howl, Howl ─────────────────────── */}
        <section className="mt-24">
          <div className="mb-7 max-w-2xl">
            <SectionHeader
              index="03"
              tag="Batteries included"
              title={
                <>
                  What makes Howl, <em className="text-primary">Howl</em>.
                </>
              }
            />
          </div>

          <div className="grid gap-4 min-[720px]:grid-cols-2 min-[940px]:grid-cols-3">
            {FEATURES.map(({ title, icon, body }, i) => (
              <div
                key={title}
                data-reveal
                style={{ transitionDelay: `${(i % 3) * 80}ms` }}
                className="rounded-2xl border border-line bg-paper p-5 transition-all duration-200 hover:-translate-y-[3px] hover:border-primary hover:shadow-[0_18px_40px_-24px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]"
              >
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-primary ring-1 ring-primary/10">
                  <Icon path={icon} />
                </div>
                <h3 className="font-mono text-[14px] font-bold text-ink">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────────── */}
        <section data-reveal className="mt-24 mb-20">
          <div className="relative overflow-hidden rounded-3xl border border-ink/40 bg-ink px-6 py-12 sm:px-12 sm:py-16">
            {/* magenta radial glow, top-right */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-magenta/30 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.05] mix-blend-overlay" />
            <div className="relative mx-auto max-w-xl text-center">
              <img src="/logo.svg" alt="" className="howl-float mx-auto h-20 w-20" />
              <h2 className="mt-5 font-mono text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Stop wiring plumbing. <em className="text-yellow">Start shipping.</em>
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-white/65">
                One command. Pick a template.{" "}
                <code className="font-mono text-white/85">deno task dev</code> and you're off.
              </p>
              <div className="mx-auto mt-7 max-w-md">
                <InstallBar />
              </div>
              <div className="mt-6 flex flex-col justify-center gap-2.5 min-[720px]:flex-row">
                <a
                  href={DOCS_URL}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 font-mono text-[14px] font-bold text-primary-content transition-colors hover:bg-primary/90"
                >
                  Read the docs →
                </a>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 font-mono text-[14px] font-semibold text-white/80 transition-colors hover:border-white/50 hover:text-white"
                >
                  View on GitHub →
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
