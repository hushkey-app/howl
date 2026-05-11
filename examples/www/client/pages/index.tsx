import { Head } from "@hushkey/howl/runtime";
import type { Context } from "@hushkey/howl";
import type { State } from "../../howl.config.ts";
import type { JSX } from "preact/jsx-runtime";

const FEATURES = [
  {
    label: "Native cookies on ctx",
    desc: "ctx.cookies.get/set/delete — append semantics preserved across middleware.",
  },
  {
    label: "Headers → every response",
    desc: "ctx.headers.set() in middleware propagates to page renders, not just API responses.",
  },
  {
    label: "React ecosystem, no Vite",
    desc: "sonner, radix, react-hot-toast — all work out of the box via Preact compat.",
  },
  {
    label: "Typed endpoints + Zod",
    desc: "defineApi gives fully typed query, body, params, and responses. Zero boilerplate.",
  },
  {
    label: "Auto-generated OpenAPI",
    desc: "getApiSpecs() returns a live OpenAPI 3.1 doc — query params, roles, responses included.",
  },
  {
    label: "Built-in RBAC",
    desc: "checkPermissionStrategy in defineConfig — one place, typed roles, no middleware noise.",
  },
];

const RENDERING_MODES: { file: string; mode: string; accent: string }[] = [
  { file: "index.tsx", mode: "SSR", accent: "text-cyan-400" },
  { file: "__index.tsx", mode: "AOT", accent: "text-violet-400" },
  { file: "___index.tsx", mode: "SSG", accent: "text-emerald-400" },
];

export default function Index(_ctx: Context<State>): JSX.Element {
  const title = _ctx.state.client.title;
  const version = _ctx.state.client.version;

  return (
    <>
      <Head>
        <title>{title} — Full-Stack Deno Framework</title>
        <meta
          name="description"
          content={`${title} is a backend-first, Deno-native full-stack framework. Typed endpoints, SSR islands, and middleware that works.`}
        />
        <meta property="og:title" content={`${title} — Full-Stack Deno Framework`} />
        <meta
          property="og:description"
          content={`${title} is a backend-first, Deno-native full-stack framework. Typed endpoints, SSR islands, and middleware that works.`}
        />
        <meta property="og:image" content="https://howl.hushkey.dev/og-image.png" />
        <meta property="og:url" content="https://howl.hushkey.dev" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} — Full-Stack Deno Framework`} />
        <meta
          name="twitter:description"
          content={`${title} is a backend-first, Deno-native full-stack framework. Typed endpoints, SSR islands, and middleware that works.`}
        />
        <meta name="twitter:image" content="https://howl.hushkey.dev/og-image.png" />
      </Head>

      {/* ─────────────── MOBILE ─────────────── */}
      <div class="sm:hidden relative bg-base-100 bg-dot-grid bg-size-[28px_28px] flex flex-col overflow-hidden pt-20 pb-6">
        <div class="pointer-events-none absolute inset-0 overflow-hidden">
          <div class="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary opacity-[0.06] blur-3xl" />
        </div>

        {/* Hero */}
        <div class="animate-fade-up-1 flex items-center justify-center mb-3 px-5">
          <img
            src="/logo.svg"
            alt="Howl"
            class="w-24 h-24"
            style="filter: drop-shadow(0 0 24px oklch(var(--p)/0.5))"
          />
        </div>

        <div class="animate-fade-up-2 text-center mb-2 px-5">
          <h1 class="text-6xl font-bold tracking-tight leading-none inline-flex items-start gap-1.5">
            {title.toUpperCase()}
            <span class="font-mono text-[11px] font-bold text-primary/70 mt-1 tracking-wider">
              v{version}
            </span>
          </h1>
          <p class="mt-2.5 text-base-content/60 text-[11px] font-bold tracking-[0.25em] uppercase">
            Web Framework · Type-Safe · Deno
          </p>
        </div>

        <p class="animate-fade-up-3 text-base-content/70 text-center text-base leading-relaxed mb-6 px-6">
          <span class="font-mono font-bold text-yellow-300 bg-primary px-1.5 py-0.5 rounded">
            Fresh
          </span>{" "}
          at the core with batteries included — ready to{" "}
          <span class="font-mono font-black text-primary">HOWL</span>. Backend-first full-stack
          framework for Deno. Typed endpoints, SSR islands, built-in RBAC, and middleware that
          propagates to every response.
        </p>

        {/* CTAs */}
        <div class="animate-fade-up-3 flex flex-col gap-2.5 mb-6 px-5">
          <a href="/docs" class="btn btn-primary btn-md w-full text-base font-bold rounded-xl">
            Read the docs →
          </a>
          <a
            href="https://github.com/hushkey-app/howl"
            target="_blank"
            class="btn btn-outline btn-md w-full rounded-xl text-base"
          >
            GitHub
          </a>
        </div>

        {/* Rendering modes — compact */}
        <div class="animate-fade-up-3 w-full px-4 mb-6">
          <div class="flex justify-center gap-2 flex-wrap">
            {RENDERING_MODES.map(({ file, mode, accent }) => (
              <span
                key={file}
                class="inline-flex items-baseline gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-md border border-base-300 bg-base-200/70"
              >
                <span class={`font-bold ${accent}`}>{file}</span>
                <span class={`text-[9px] font-black tracking-widest ${accent}/80`}>{mode}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Scaffold one-liner */}
        <div class="animate-fade-up-3 w-full px-4 mb-10">
          <p class="text-center font-black text-[11px] uppercase tracking-widest text-base-content/40 mb-3">
            Scaffold in 30 seconds
          </p>
          <div class="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-xl shadow-primary/10">
            <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
              <span class="w-2.5 h-2.5 rounded-full bg-error/70" />
              <span class="w-2.5 h-2.5 rounded-full bg-warning/70" />
              <span class="w-2.5 h-2.5 rounded-full bg-success/70" />
              <span class="ml-1.5 font-mono text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
                terminal
              </span>
            </div>
            <div class="px-4 py-3.5 font-mono text-[12.5px] leading-relaxed">
              <div class="flex flex-wrap gap-x-2">
                <span class="text-violet-400 select-none">$</span>
                <span class="text-zinc-200">deno run -Ar</span>
                <span class="text-emerald-400 font-semibold">jsr:@hushkey/howl-init</span>
              </div>
              <div class="text-zinc-500 text-[11px] mt-2 leading-relaxed">
                no install · pick a template · run <span class="text-zinc-300">deno task dev</span>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div class="animate-fade-up-5 w-full mt-4 px-4">
          <p class="text-center font-mono text-[11px] uppercase tracking-widest text-base-content/40 mb-5">
            What {title} adds on top of Fresh
          </p>
          <div class="flex flex-col gap-3">
            {FEATURES.map(({ label, desc }) => (
              <div key={label} class="rounded-xl border border-base-300 bg-base-200/70 px-4 py-3">
                <p class="font-mono text-[12px] font-bold text-primary mb-1">{label}</p>
                <p class="text-[12px] text-base-content/60 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─────────────── DESKTOP ─────────────── */}
      <div class="hidden sm:block relative bg-base-100 bg-dot-grid bg-size-[28px_28px] overflow-hidden">
        <div class="flex flex-col items-center px-6 ">
          {/* HTTP Traffic */}
          <div class="animate-fade-up-1 relative flex items-center justify-center mb-3 mt-2 h-96 w-full max-w-5xl overflow-hidden">
            <div
              class="absolute inset-0 flex items-stretch justify-center gap-2 px-6"
              style="mask-image: linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%);"
            >
              {[
                {
                  method: "GET",
                  code: "200",
                  color: "#22d3ee",
                  dir: "up",
                  duration: 4.8,
                  delay: 0,
                },
                {
                  method: "POST",
                  code: "201",
                  color: "#fbbf24",
                  dir: "down",
                  duration: 6.2,
                  delay: 1.4,
                },
                {
                  method: "PUT",
                  code: "204",
                  color: "#a78bfa",
                  dir: "up",
                  duration: 5.5,
                  delay: 0.7,
                },
                {
                  method: "GET",
                  code: "304",
                  color: "#22d3ee",
                  dir: "down",
                  duration: 7.0,
                  delay: 2.1,
                },
                {
                  method: "DELETE",
                  code: "204",
                  color: "#f87171",
                  dir: "up",
                  duration: 5.0,
                  delay: 1.6,
                },
                {
                  method: "PATCH",
                  code: "200",
                  color: "#34d399",
                  dir: "down",
                  duration: 4.4,
                  delay: 0.4,
                },
                {
                  method: "GET",
                  code: "200",
                  color: "#22d3ee",
                  dir: "up",
                  duration: 6.5,
                  delay: 1.9,
                },
                {
                  method: "POST",
                  code: "401",
                  color: "#fbbf24",
                  dir: "down",
                  duration: 5.8,
                  delay: 0.9,
                },
                {
                  method: "GET",
                  code: "404",
                  color: "#22d3ee",
                  dir: "up",
                  duration: 7.2,
                  delay: 2.5,
                },
                {
                  method: "PUT",
                  code: "200",
                  color: "#a78bfa",
                  dir: "down",
                  duration: 6.0,
                  delay: 0.3,
                },
                {
                  method: "GET",
                  code: "500",
                  color: "#22d3ee",
                  dir: "up",
                  duration: 5.3,
                  delay: 1.1,
                },
              ].map((t, i) => (
                <div key={i} class="relative flex-1 max-w-18 min-w-11" style="container-type: size">
                  <div
                    class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-linear-to-b from-transparent via-base-content/10 to-transparent"
                    style={`animation: lane-pulse ${
                      t.duration * 1.3
                    }s ease-in-out ${t.delay}s infinite`}
                  />
                  <div
                    class="absolute left-1/2 -translate-x-1/2 top-1.5 w-1 h-1 rounded-full"
                    style={`background:${t.color}66;box-shadow:0 0 6px ${t.color}80`}
                  />
                  <div
                    class="absolute left-1/2 -translate-x-1/2 bottom-1.5 w-1 h-1 rounded-full"
                    style={`background:${t.color}66;box-shadow:0 0 6px ${t.color}80`}
                  />
                  <div
                    class="absolute left-1/2 -translate-x-1/2 px-1.5 py-0.75 rounded-[3px] font-mono text-[10px] font-bold whitespace-nowrap pointer-events-none"
                    style={`color:${t.color};background:${t.color}10;border:1px solid ${t.color}55;box-shadow:0 0 12px ${t.color}40, inset 0 0 1px ${t.color};animation: packet-${t.dir} ${t.duration}s linear ${t.delay}s infinite;`}
                  >
                    {t.method} {t.code}
                  </div>
                </div>
              ))}
            </div>
            <div
              class="absolute z-5 w-56 h-56 rounded-full pointer-events-none"
              style="background: radial-gradient(circle, oklch(var(--b1)) 0%, oklch(var(--b1)/0.85) 45%, transparent 75%)"
            />
            <img
              src="/logo.svg"
              alt="Howl"
              class="relative z-10 w-40 h-40"
              style="filter: drop-shadow(0 0 32px oklch(var(--p)/0.5)) drop-shadow(0 0 80px oklch(var(--p)/0.25))"
            />
          </div>

          <div class="animate-fade-up-2 text-center mb-2">
            <h1 class="text-5xl lg:text-6xl font-bold tracking-tight leading-none inline-flex items-start gap-2 justify-center">
              {title.toUpperCase()}
              {/* <span class="text-primary">.</span> */}
              <span class="font-mono text-xs font-bold text-primary/70 mt-1.5 tracking-wider">
                v{version}
              </span>
            </h1>
            <p class="mt-3 text-base-content/50 text-sm tracking-[0.25em] uppercase font-bold">
              Web Framework · Type-Safe · Deno
            </p>
          </div>

          <p class="animate-fade-up-3 text-base-content/60 text-center max-w-lg text-base leading-relaxed mb-5">
            <span class="font-mono font-bold text-yellow-300 bg-primary px-1.5 py-0.5 rounded">
              Fresh
            </span>{" "}
            at the core with batteries included — ready to{" "}
            <span class="font-mono font-black text-primary">HOWL</span>. Backend-first full-stack
            framework for Deno. Typed endpoints, SSR islands, built-in RBAC, and middleware that
            propagates to every response.
          </p>

          {/* Rendering modes — compact */}
          <div class="animate-fade-up-3 w-full max-w-3xl mb-8 flex justify-center gap-3 flex-wrap">
            {RENDERING_MODES.map(({ file, mode, accent }) => (
              <span
                key={file}
                class="inline-flex items-baseline gap-2 font-mono text-[13px] px-3 py-1.5 rounded-md border border-base-300 bg-base-200/70"
              >
                <span class={`font-bold ${accent}`}>{file}</span>
                <span class={`text-[10px] font-black tracking-widest ${accent}/80`}>{mode}</span>
              </span>
            ))}
          </div>

          {/* Scaffold one-liner */}
          <div class="animate-fade-up-3 w-full max-w-3xl">
            <p class="text-center font-black text-xs uppercase tracking-[0.3em] text-base-content/40 mb-5">
              Scaffold a new project in 30 seconds
            </p>
            <div class="rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-primary/15 overflow-hidden">
              <div class="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
                <span class="w-2.5 h-2.5 rounded-full bg-error/70" />
                <span class="w-2.5 h-2.5 rounded-full bg-warning/70" />
                <span class="w-2.5 h-2.5 rounded-full bg-success/70" />
                <span class="ml-2 font-mono text-xs text-zinc-400">terminal</span>
              </div>
              <div class="px-7 py-6 font-mono text-[15px] flex flex-col gap-3">
                <div class="flex items-center gap-3 flex-wrap">
                  <span class="text-violet-400 select-none">$</span>
                  <span class="text-zinc-200">deno run -Ar</span>
                  <span class="text-emerald-400 font-semibold">jsr:@hushkey/howl-init</span>
                </div>
                <div class="text-zinc-500 text-[13px] leading-relaxed pl-5">
                  <span class="text-zinc-400">→</span> picks a template{" "}
                  <span class="text-zinc-600">·</span> scaffolds a project{" "}
                  <span class="text-zinc-600">·</span>{" "}
                  <span class="text-zinc-300">deno task dev</span>{" "}
                  <span class="text-zinc-600">·</span> <span class="text-success/80">running.</span>
                </div>
              </div>
            </div>
            <p class="text-center font-mono text-[11px] text-base-content/40 mt-4 tracking-widest uppercase">
              No install. No global CLI. Just Deno.
            </p>
          </div>

          {/* Core — marquee */}
          {
            /* <div class="animate-fade-up-5 w-full mt-10">
            <div class="relative overflow-hidden mask-[linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
              <div class="flex gap-3 w-max animate-marquee">
                {[...CORE, ...CORE].map((item, i) => (
                  <span
                    key={`${item}-${i}`}
                    class="font-mono text-[12px] px-3 py-1.5 rounded-md border border-base-300 bg-base-200/70 text-base-content/70 whitespace-nowrap"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <style>
            {`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
            .animate-marquee { animation: marquee 40s linear infinite; }`}
          </style> */
          }
        </div>
      </div>
    </>
  );
}
