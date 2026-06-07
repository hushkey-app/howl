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
  { id: "text", label: "BYO" },
];

/** The real `server/main.ts` bootstrap for a given engine — the core ships no
 * renderer, so you register one and it owns the whole response. */
function mainCode(engine: Engine): string {
  if (engine === "vue") {
    return `import { Howl, staticFiles } from "@hushkey/howl";
import { vueEngine } from "@hushkey/howl-vue";
import { apiConfig, type State } from "../howl.config.ts";

export const app = new Howl<State>({
  engines: { vue: vueEngine() }, // swap the package — same core
});

app.use(staticFiles());
app.fsApiRoutes(apiConfig); // mounts server/apis/**/*.api.ts
app.fsClientRoutes();       // mounts client/pages/**/*.tsx

export default { app };`;
  }
  if (engine === "text") {
    return `import { Howl, staticFiles } from "@hushkey/howl";
import type { RenderEngine } from "@hushkey/howl";
import { apiConfig, type State } from "../howl.config.ts";

// The seam is one method — total control.
const text: RenderEngine = {
  render: (ctx, opts) => ctx.html(String(opts.data)),
};

export const app = new Howl<State>({
  engines: { text },
});

app.use(staticFiles());
app.fsApiRoutes(apiConfig); // mounts server/apis/**/*.api.ts
app.fsClientRoutes();       // mounts client/pages/**/*.tsx

export default { app };`;
  }
  return `import { Howl, staticFiles } from "@hushkey/howl";
import { reactEngine } from "@hushkey/howl-react";
import { apiConfig, type State } from "../howl.config.ts";

export const app = new Howl<State>({
  engines: { react: reactEngine() }, // engine owns the response
});

app.use(staticFiles());
app.fsApiRoutes(apiConfig); // mounts server/apis/**/*.api.ts
app.fsClientRoutes();       // mounts client/pages/**/*.tsx

export default { app };`;
}

const ENGINE_PKG: Record<Engine, string> = {
  react: "@hushkey/howl-react",
  vue: "@hushkey/howl-vue",
  text: "(your module)",
};

/** The render seam — core ships types only (shown in the §01 code card). */
const CORE_CODE = `// Core ships types only — it renders nothing.
import type { Context } from "@hushkey/howl";

export interface RenderEngine {
  // One method. The engine owns the response.
  render(ctx: Context, opts: RenderOptions): Response;
}`;

/** The backend showcase — a fully typed endpoint. */
const API_CODE = `import { defineApi } from "../../howl.config.ts";
import { z } from "zod";

// Typed query, body, params + responses — validated by Zod.
export default defineApi({
  name: "ListUsers",
  method: "GET",
  roles: ["ADMIN"],                  // built-in RBAC
  query: z.object({ limit: z.coerce.number().max(100) }),
  responses: { 200: z.object({ users: z.array(User) }) },
  rateLimit: { max: 60, windowMs: 60_000 },
  handler: (ctx) => listUsers(ctx.query.limit),
});`;

/** A page is just a component; its data comes from the handler. */
const PAGE_CODE = `import type { ReactPageProps } from "@hushkey/howl-react";

// Pages are components; data comes from the route handler.
export default function Home({ data }: ReactPageProps) {
  return <h1>Hello {data.name}</h1>;
}`;

/** The generated client — params, body, and response inferred from your *.api.ts files. */
const CLIENT_CODE = `import { http } from "@app/http-client";
import { useEffect, useState } from "react";

// One generated client, shaped like your *.api.ts tree. Params,
// body, and the response type are inferred — change the API and
// the call won't silently drift.
export default function UserCard({ id }: { id: string }) {
  const [user, setUser] = useState<User>();

  useEffect(() => {
    http.api.users[":id"].$get({ params: { id } })
      .then((res) => setUser(res.data));
    //                       ^? { id: string; name: string; email: string }
  }, [id]);

  return <h2>{user?.name ?? "…"}</h2>;
}`;

/** The Vue page — shown when the Vue engine is selected. Paste real code here. */
const PAGE_CODE_VUE = `<script setup lang="ts">
import type { VuePageProps } from "@hushkey/howl-vue";

// Pages are components; data comes from the route handler.
const { data } = defineProps<VuePageProps>();
</script>

<template>
  <h1>Hello {{ data.name }}</h1>
</template>`;

/** The Vue fetch component — the generated client used from a Vue SFC. */
const CLIENT_CODE_VUE = `<script setup lang="ts">
import { http } from "@app/http-client";
import { onMounted, ref } from "vue";

const props = defineProps<{ id: string }>();
const user = ref<User>();

// Types inferred from your *.api.ts tree — change the API,
// the call won't silently drift.
onMounted(async () => {
  const res = await http.api.users[":id"].$get({ params: { id: props.id } });
  user.value = res.data;
});
</script>

<template>
  <h2>{{ user?.name ?? "…" }}</h2>
</template>`;

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

/** Tokenise a comment-free code fragment into coloured spans. */
function tokenize(s: string, keyStart: number): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /("[^"]*")|([A-Za-z_$][A-Za-z0-9_$]*)|([{}()<>[\];:,.=]+)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  let key = keyStart;
  while ((m = re.exec(s)) !== null) {
    const [tok, str, ident, punct] = m;
    if (str) {
      out.push(<span key={key++} className="text-success">{tok}</span>);
    } else if (ident) {
      if (KEYWORDS.has(ident)) {
        out.push(<span key={key++} className="font-semibold text-primary">{tok}</span>);
      } else if (/^[A-Z]/.test(ident)) {
        out.push(<span key={key++} className="text-magenta">{tok}</span>);
      } else if (s[re.lastIndex] === "(") {
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

/** Lightweight TS syntax highlighting for the IDE panel code samples. */
function highlightLine(line: string): ReactNode {
  // A `//` outside a string starts a comment (samples have no `//` in strings).
  const ci = line.indexOf("//");
  const isComment = ci >= 0 && (line.slice(0, ci).split('"').length - 1) % 2 === 0;
  if (isComment) {
    return (
      <>
        {ci > 0 && tokenize(line.slice(0, ci), 0)}
        <span className="text-ink-3">{line.slice(ci)}</span>
      </>
    );
  }
  return tokenize(line, 0);
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

/** Inline slide-up engine cycler — React (blue), Vue (green), your own (purple). */
function EngineSlide() {
  const items: { label: string; bg: string }[] = [
    { label: "React", bg: "bg-info" },
    { label: "Vue", bg: "bg-success" },
    { label: "BYO", bg: "bg-primary" },
    { label: "React", bg: "bg-info" },
  ];
  return (
    <span className="relative inline-block h-6 overflow-hidden rounded-md align-middle">
      <span className="engine-slide flex flex-col">
        {items.map((it, i) => (
          <span
            key={i}
            className={`flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 font-mono text-[13px] font-semibold text-white ${it.bg}`}
          >
            {it.label}
          </span>
        ))}
      </span>
    </span>
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
    <div className="overflow-hidden rounded-xl border border-white/10 bg-terminal shadow-[0_18px_40px_-20px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]">
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

/** A code sample rendered like a real editor — gutter line numbers + caret. */
function CodeEditor(
  { code, caret = true, minLines = 0 }: {
    code: string;
    caret?: boolean;
    minLines?: number;
  },
) {
  const lines = code.split("\n");
  const rows = Array.from({ length: Math.max(lines.length, minLines) });
  return (
    <div className="flex overflow-x-auto bg-code-bg font-mono text-[12.5px] leading-[1.8]">
      <div
        aria-hidden="true"
        className="select-none border-r border-line/70 px-3 py-4 text-right text-ink-3/50"
      >
        {rows.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <pre className="flex-1 px-4 py-4">
        {rows.map((_, i) => (
          <div key={i} className="whitespace-pre">
            {lines[i] ? highlightLine(lines[i]) : " "}
            {caret && i === lines.length - 1 && (
              <span className="howl-cursor ml-0.5 text-primary">▍</span>
            )}
          </div>
        ))}
      </pre>
    </div>
  );
}

/**
 * The tallest sample the IDE panel can show — used as the editor's `minLines` so
 * opening a different file never resizes the panel.
 */
const PANEL_MAX_LINES: number = Math.max(
  ...[
    mainCode("react"),
    mainCode("vue"),
    mainCode("text"),
    PAGE_CODE,
    PAGE_CODE_VUE,
    CLIENT_CODE,
    CLIENT_CODE_VUE,
    API_CODE,
  ].map((s) => s.split("\n").length),
);

/** A standalone, titled code card — used in the routing section. */
function CodeCard({ name, code }: { name: string; code: string }) {
  return (
    <div
      data-reveal
      className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_60px_-44px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]"
    >
      <div className="flex items-center gap-1.5 border-b border-line bg-base-100/60 px-4 py-2.5 font-mono text-[12px] text-ink-3">
        <FileGlyph />
        {name}
      </div>
      <CodeEditor code={code} caret={false} />
    </div>
  );
}

const DEV_CODE = `import { HowlBuilder } from "@hushkey/howl/dev";
import { tailwindPlugin } from "@hushkey/howl/plugins";
import { reactPlugin } from "@hushkey/howl-react/plugin";
import { app } from "./server/main.ts";

const builder = new HowlBuilder(app, {
  serverEntry: "./server/main.ts", // apis/ resolve from here
  clientEntry: "./client/pages/_app.tsx",
  plugins: [reactPlugin()],
});
tailwindPlugin(builder.getBuilder("default")!);

// No Vite — one builder runs dev and the production build.
Deno.args.includes("build")
  ? await builder.build()
  : await builder.listen({ port: 8000 });`;

/** File-system → route mapping rows shown in the §2 routing map. */
const ROUTE_MAP: { fs: string; method: string; url: string }[] = [
  { fs: "client/pages/index.tsx", method: "GET", url: "/" },
  { fs: "client/pages/docs/[slug].tsx", method: "GET", url: "/docs/:slug" },
  { fs: "server/apis/public/ping.api.ts", method: "GET", url: "/api/public/ping" },
  { fs: "server/apis/users/[id].api.ts", method: "POST", url: "/api/users/:id" },
];

/** A file path with `[params]` and the enforced `.api.ts` suffix accented. */
function FsPath({ fs }: { fs: string }) {
  const parts = fs.split(/(\[[^\]]+\]|\.api\.ts$)/g).filter(Boolean);
  return (
    <code className="font-mono text-[12.5px] text-ink-2">
      {parts.map((p, i) =>
        p === ".api.ts"
          ? <span key={i} className="font-bold text-magenta">{p}</span>
          : /^\[.+\]$/.test(p)
          ? <span key={i} className="text-primary">{p}</span>
          : <span key={i}>{p}</span>
      )}
    </code>
  );
}

/** The §2 file → route map card. */
function RouteMap() {
  return (
    <div
      data-reveal
      className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_60px_-44px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]"
    >
      <div className="border-b border-line bg-base-100/60 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-ink-3">
        file → route
      </div>
      <ul className="divide-y divide-line/70">
        {ROUTE_MAP.map((r) => (
          <li key={r.fs} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <FsPath fs={r.fs} />
            <span className="text-ink-3">→</span>
            <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
              {r.method}
            </span>
            <code className="font-mono text-[12.5px] text-ink">{r.url}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A file-tree glyph. */
function FileGlyph() {
  return (
    <svg
      className="h-3 w-3 shrink-0 text-ink-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M7 3h7l5 5v13H7z" />
    </svg>
  );
}

/** The file-type a tree row / editor header renders a monogram for. */
type Lang = "ts" | "tsx" | "vue" | "api" | "deno" | "svg" | "css";

const LANG_BADGE: Record<Lang, { label: string; cls: string }> = {
  ts: { label: "TS", cls: "bg-info/15 text-info ring-info/30" },
  tsx: { label: "TSX", cls: "bg-primary/15 text-primary ring-primary/30" },
  vue: { label: "V", cls: "bg-success/15 text-success ring-success/30" },
  api: { label: "API", cls: "bg-magenta-soft text-magenta ring-magenta/30" },
  deno: { label: "{ }", cls: "bg-line/50 text-ink-3 ring-line" },
  svg: { label: "SVG", cls: "bg-yellow/15 text-yellow ring-yellow/30" },
  css: { label: "CSS", cls: "bg-info/15 text-info ring-info/30" },
};

/** A small monogram badge denoting a file's language. */
function FileIcon({ lang }: { lang: Lang }) {
  const b = LANG_BADGE[lang];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 shrink-0 items-center justify-center rounded-[4px] px-1 font-mono text-[8px] font-black uppercase leading-none ring-1 ${b.cls}`}
    >
      {b.label}
    </span>
  );
}

/** A rotating disclosure chevron for a tree folder. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 shrink-0 text-ink-3 transition-transform duration-150 ${
        open ? "" : "-rotate-90"
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** A folder glyph for the tree. */
function FolderGlyph() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-ink-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3.8a1.5 1.5 0 0 1 1.06.44L10.8 7h8.7A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"
      />
    </svg>
  );
}

/** A node in the IDE panel's project tree. */
type TreeNode =
  | { t: "dir"; name: string; children: TreeNode[] }
  | { t: "file"; name: string; lang: Lang };

/** Shared interaction state threaded through the recursive tree. */
type TreeCtx = {
  /** Full path of the currently open file. */
  openPath: string;
  /** Opens a file by its full path. */
  onOpen: (path: string) => void;
  /** Whether a path maps to a featured (openable) file. */
  isFeatured: (path: string) => boolean;
};

/** Renders one tree node — a folder, a featured (clickable) file, or context. */
function TreeItem(
  { node, prefix, ctx }: { node: TreeNode; prefix: string; ctx: TreeCtx },
) {
  if (node.t === "dir") return <TreeDir node={node} prefix={prefix} ctx={ctx} />;
  const path = prefix + node.name;
  if (!ctx.isFeatured(path)) {
    return (
      <li>
        <div className="flex items-center gap-1.5 rounded-md py-1 pr-2 pl-1.5 font-mono text-[12.5px] text-ink-3/45">
          <span aria-hidden="true" className="w-3 shrink-0" />
          <span className="opacity-50">
            <FileIcon lang={node.lang} />
          </span>
          <span className="truncate">{node.name}</span>
        </div>
      </li>
    );
  }
  const active = path === ctx.openPath;
  return (
    <li>
      <button
        type="button"
        onClick={() => ctx.onOpen(path)}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-1.5 text-left font-mono text-[12.5px] transition-colors ${
          active
            ? "bg-accent-soft font-semibold text-primary ring-1 ring-primary/15"
            : "text-ink-2 hover:bg-accent-soft/40 hover:text-primary"
        }`}
      >
        <span aria-hidden="true" className="w-3 shrink-0" />
        <FileIcon lang={node.lang} />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

/** A collapsible folder row plus its indented children. */
function TreeDir(
  { node, prefix, ctx }: {
    node: Extract<TreeNode, { t: "dir" }>;
    prefix: string;
    ctx: TreeCtx;
  },
) {
  const [open, setOpen] = useState(true);
  const childPrefix = `${prefix}${node.name}/`;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-1.5 text-left font-mono text-[12.5px] text-ink-2 transition-colors hover:text-ink"
      >
        <Chevron open={open} />
        <FolderGlyph />
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <ul className="mt-0.5 ml-[13px] space-y-0.5 border-l border-line/60 pl-2.5">
          {node.children.map((child, i) => (
            <TreeItem key={i} node={child} prefix={childPrefix} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

const ICON_BOLT = "M13 3 4 14h6l-1 7 9-11h-6l1-7z";
const ICON_ROUTE =
  "M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10zM12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z";
const ICON_API = "M4 5h16v6H4zM4 13h16v6H4zM7.5 8h.01M7.5 16h.01";
const ICON_CLIENT =
  "M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.5 3.5 0 0 0 5 5l1-1";

/** The real Howl project shown in the IDE panel. Featured files (those a
 * `features()` entry points at by path) are clickable and open in the editor;
 * the rest are dimmed context so the structure reads as a real app. The view
 * files take the engine's extension (`.tsx` for React/BYO, `.vue` for Vue). */
function projectTree(engine: Engine): TreeNode[] {
  const view: Lang = engine === "vue" ? "vue" : "tsx";
  const ext = engine === "vue" ? "vue" : "tsx";
  return [
    {
      t: "dir",
      name: "client",
      children: [
        {
          t: "dir",
          name: "components",
          children: [{ t: "file", name: `UserCard.${ext}`, lang: view }],
        },
        {
          t: "dir",
          name: "pages",
          children: [
            {
              t: "dir",
              name: "docs",
              children: [{ t: "file", name: `[slug].${ext}`, lang: view }],
            },
            { t: "file", name: `_app.${ext}`, lang: view },
            { t: "file", name: `_error.${ext}`, lang: view },
            { t: "file", name: `_layout.${ext}`, lang: view },
            { t: "file", name: `index.${ext}`, lang: view },
          ],
        },
        {
          t: "dir",
          name: "store",
          children: [{ t: "file", name: "index.store.ts", lang: "ts" }],
        },
      ],
    },
    {
      t: "dir",
      name: "server",
      children: [
        {
          t: "dir",
          name: "apis",
          children: [
            {
              t: "dir",
              name: "public",
              children: [{ t: "file", name: "ping.api.ts", lang: "api" }],
            },
            { t: "file", name: "users.api.ts", lang: "api" },
          ],
        },
        { t: "file", name: "main.ts", lang: "ts" },
      ],
    },
    {
      t: "dir",
      name: "static",
      children: [{ t: "file", name: "logo.svg", lang: "svg" }],
    },
    { t: "file", name: "deno.json", lang: "deno" },
    { t: "file", name: "dev.ts", lang: "ts" },
    { t: "file", name: "howl.config.ts", lang: "ts" },
    { t: "file", name: "tailwind.config.ts", lang: "ts" },
  ];
}

/** A featured file — a top tab that opens a specific file in the project tree. */
type Feature = {
  /** Stable id (also the tab key). */
  id: string;
  /** Tab label. */
  label: string;
  /** Tab icon path. */
  icon: string;
  /** Full path of the file it opens — must exist in `projectTree(engine)`. */
  path: string;
  /** Language of the opened file. */
  lang: Lang;
  /** Code shown when this file is open. */
  code: string;
};

/** The featured files / tabs. The engine toggle swaps the bootstrap and the view
 * files (React `.tsx` ↔ Vue `.vue`); the typed API is engine-agnostic. */
function features(engine: Engine): Feature[] {
  const isVue = engine === "vue";
  const ext = isVue ? "vue" : "tsx";
  const view: Lang = isVue ? "vue" : "tsx";
  return [
    {
      id: "bootstrap",
      label: "Bootstrap",
      icon: ICON_BOLT,
      path: "server/main.ts",
      lang: "ts",
      code: mainCode(engine),
    },
    {
      id: "routing",
      label: "Routing",
      icon: ICON_ROUTE,
      path: `client/pages/index.${ext}`,
      lang: view,
      code: isVue ? PAGE_CODE_VUE : PAGE_CODE,
    },
    {
      id: "client",
      label: "Fetch",
      icon: ICON_CLIENT,
      path: `client/components/UserCard.${ext}`,
      lang: view,
      code: isVue ? CLIENT_CODE_VUE : CLIENT_CODE,
    },
    {
      id: "api",
      label: "Typed API",
      icon: ICON_API,
      path: "server/apis/users.api.ts",
      lang: "api",
      code: API_CODE,
    },
  ];
}

/** The §hero IDE panel — top tabs swap a folder tree + code sample together, and
 * an engine toggle rewrites the bootstrap to prove the core renders nothing. */
function ViewLayerPanel({ reveal = true }: { reveal?: boolean } = {}) {
  const [engine, setEngine] = useState<Engine>("react");
  const [openPath, setOpenPath] = useState("server/main.ts");

  const feats = features(engine);
  const featByPath = new Map(feats.map((f) => [f.path, f]));
  const openFeat = featByPath.get(openPath) ?? feats[0];

  const treeCtx: TreeCtx = {
    openPath: openFeat.path,
    onOpen: setOpenPath,
    isFeatured: (p) => featByPath.has(p),
  };

  // Switching engine rewrites the bootstrap — open it so the change is visible.
  const pickEngine = (id: Engine) => {
    setEngine(id);
    setOpenPath("server/main.ts");
  };

  return (
    <div
      data-reveal={reveal ? "" : undefined}
      className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_40px_90px_-50px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]"
    >
      {/* Featured-file tabs */}
      <div
        role="tablist"
        aria-label="Howl scenarios"
        className="scrollbar-hide flex items-center gap-1 overflow-x-auto border-b border-line bg-base-100/60 px-2 py-2"
      >
        {feats.map((f) => {
          const active = f.path === openFeat.path;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setOpenPath(f.path)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-mono text-[13px] transition-colors ${
                active ? "bg-base-100 text-ink ring-1 ring-line" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              <span className={active ? "text-primary" : ""}>
                <Icon path={f.icon} />
              </span>
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Body: file tree + editor */}
      <div className="grid min-[560px]:grid-cols-[minmax(190px,236px)_1fr]">
        <aside className="hidden border-r border-line bg-base-100/30 p-2.5 min-[560px]:block">
          <ul className="space-y-0.5">
            {projectTree(engine).map((node, i) => (
              <TreeItem
                key={i}
                node={node}
                prefix=""
                ctx={treeCtx}
              />
            ))}
          </ul>
        </aside>

        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b border-line bg-base-100/40 px-4 py-2.5">
            <FileIcon lang={openFeat.lang} />
            <span className="truncate font-mono text-[12.5px] text-ink-2">{openFeat.path}</span>
          </div>
          <CodeEditor code={openFeat.code} caret={false} minLines={PANEL_MAX_LINES} />
        </div>
      </div>

      {/* Engine swap + status */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-base-100/60 px-3 py-2.5">
        <div
          role="tablist"
          aria-label="Render engine"
          className="flex items-center gap-0.5 rounded-lg border border-line bg-base-100 p-0.5"
        >
          {ENGINES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={engine === id}
              onClick={() => pickEngine(id)}
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
        <span className="font-mono text-[11px] text-magenta">{ENGINE_PKG[engine]}</span>
        <span className="ml-auto hidden font-mono text-[11px] text-ink-3 min-[720px]:inline">
          core renders nothing — the engine owns the response
        </span>
      </div>
    </div>
  );
}

export default function Index(_props: ReactPageProps<unknown, State>) {
  useReveal();

  const tagline =
    "Howl is a server-first, full-stack Deno framework: SSR owns first paint and hands off to a thick SPA client, the view engine (React or Vue) is a plugin, APIs are typed contracts collocated with your pages, and state stays coherent across navigation. No Vite.";

  useHead({
    title: "Howl — Server-first Deno framework",
    meta: [
      { name: "description", content: tagline },
      { property: "og:title", content: "Howl — Server-first Deno framework" },
      { property: "og:description", content: tagline },
      { property: "og:image", content: "https://howl.hushkey.dev/og.png" },
      { property: "og:url", content: "https://howl.hushkey.dev" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Howl — Server-first Deno framework" },
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

      <main className="relative mx-auto max-w-360 px-5 pt-24 sm:px-9 sm:pt-32">
        {/* ── Hero ───────────────────────────────────────────── */}
        <section className="grid items-center gap-10 min-[940px]:grid-cols-12 min-[940px]:gap-14">
          <div className="order-2 animate-fade-up-1 min-[940px]:order-1 min-[940px]:col-start-1 min-[940px]:col-span-6">
            {
              /* <p className="mb-5 flex flex-wrap items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-primary">
                v{version}
              </span>
              <span>Server-first · Deno · No Vite</span>
            </p> */
            }
            <h1 className="font-mono text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-ink sm:text-[4rem]">
              Typed endpoints.<br />
              <em className="text-primary">Zero plumbing.</em>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-2 sm:text-base">
              Howl is a{" "}
              <strong className="font-semibold text-ink">server-first</strong>, full-stack Deno
              framework. SSR owns first paint, then hands off to a{" "}
              <strong className="font-semibold text-ink">thick SPA client</strong> — the view engine
              {" "}
              <EngineSlide />{" "}
              is a plugin, so the core renders nothing. Typed API contracts sit beside your pages,
              state stays coherent across navigation, and there's no Vite.
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

          <div className="order-1 animate-fade-up-3 min-[940px]:order-2 min-[940px]:col-start-7 min-[940px]:col-span-6 min-[940px]:-ml-7 min-[940px]:-mr-[max(36px,50vw-684px)] pr-5">
            <ViewLayerPanel reveal={false} />
            <p className="mt-3 text-center font-mono text-[11px] text-ink-3">
              Switch a tab — the generated client, routing, a typed{" "}
              <code className="text-primary">defineApi</code> endpoint, or the render seam.
            </p>
          </div>
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
            <p data-reveal className="mt-3 text-[13px] leading-relaxed text-ink-3">
              Howl grew out of Fresh 2.x primitives, then diverged completely — its own rendering,
              navigation, state model, and build pipeline. Lineage, not identity.
            </p>
          </div>
          <CodeCard name="packages/howl/engine.ts" code={CORE_CODE} />
          <p data-reveal className="mt-4 text-[13px] leading-relaxed text-ink-3">
            One interface, types only. The engine package owns the whole response — swap React for
            Vue (or your own) from the IDE switcher above without touching the core.
          </p>
        </section>

        {/* ── 02 · Rendering modes ───────────────────────────── */}
        {/* ── 02 · Filesystem routing ────────────────────────── */}
        <section className="mt-24">
          <div className="mb-7 max-w-2xl">
            <SectionHeader
              index="02"
              tag="One convention"
              title={
                <>
                  Pages and APIs, <em className="text-primary">one routing system</em>.
                </>
              }
            />
            <p data-reveal className="mt-4 text-[15px] leading-relaxed text-ink-2">
              Drop a file, get a route. Folders map to URL segments and{" "}
              <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[13px] text-primary">
                [param]
              </code>{" "}
              folders to path params — the same filesystem convention for both. The only difference:
              API files are enforced to end in{" "}
              <code className="rounded bg-magenta-soft px-1.5 py-0.5 font-mono text-[13px] text-magenta">
                .api.ts
              </code>.{" "}
              <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[13px] text-primary">
                app.fsClientRoutes()
              </code>{" "}
              mounts your pages;{" "}
              <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[13px] text-primary">
                app.fsApiRoutes()
              </code>{" "}
              the typed endpoints.
            </p>
          </div>

          <div className="grid gap-4 min-[940px]:grid-cols-2">
            <CodeCard name="server/main.ts" code={mainCode("react")} />
            <CodeCard name="dev.ts" code={DEV_CODE} />
          </div>
          <div className="mt-4">
            <RouteMap />
          </div>
        </section>

        {/* ── 03 · Rendering modes ───────────────────────────── */}
        <section className="mt-24">
          <div className="mb-7 max-w-2xl">
            <SectionHeader
              index="03"
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
                className="group rounded-2xl border border-line bg-paper p-5 transition-all duration-200 hover:-translate-y-0.75 hover:border-primary hover:shadow-[0_18px_40px_-24px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]"
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

        {/* ── 04 · What makes Howl, Howl ─────────────────────── */}
        <section className="mt-24">
          <div className="mb-7 max-w-2xl">
            <SectionHeader
              index="04"
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
                className="rounded-2xl border border-line bg-paper p-5 transition-all duration-200 hover:-translate-y-0.75 hover:border-primary hover:shadow-[0_18px_40px_-24px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]"
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
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-terminal px-6 py-12 sm:px-12 sm:py-16">
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
