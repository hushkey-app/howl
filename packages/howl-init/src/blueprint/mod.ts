import { engineOf, isFullstack, type ProjectSpec, type UiKit } from "../spec.ts";
import { denoJson, devTs, envExample, gitignore, howlConfigTs, mainTs, pingApiTs } from "./core.ts";
import { styleCss, tailwindConfigTs } from "./styles.ts";
import { reactFiles } from "./react.ts";
import { vueFiles } from "./vue.ts";
import { serviceFiles } from "./service.ts";
import { agentsMd, claudeMd } from "./agents.ts";

/**
 * Compose the full set of project files for a {@link ProjectSpec}. Returns a
 * map of project-relative path → file contents. This is the heart of the
 * scaffolder: a base (backend) plus feature fragments (engine, UI kit, service
 * layer) selected by the spec.
 */
export function buildProjectFiles(spec: ProjectSpec): Map<string, string> {
  const files = new Map<string, string>();

  // Base — every project.
  files.set("deno.json", denoJson(spec));
  files.set("dev.ts", devTs(spec));
  files.set("server/main.ts", mainTs(spec));
  files.set("howl.config.ts", howlConfigTs(spec));
  files.set("server/apis/public/ping.api.ts", pingApiTs());
  files.set(".gitignore", gitignore(spec));
  files.set(".env.example", envExample(spec));
  files.set("README.md", readmeMd(spec));
  files.set("AGENTS.md", agentsMd(spec));
  files.set("CLAUDE.md", claudeMd());

  // Frontend — fullstack only.
  if (isFullstack(spec)) {
    const ui = spec.ui as UiKit;
    files.set("static/style.css", styleCss(ui));
    files.set("tailwind.config.ts", tailwindConfigTs(ui));
    const engine = engineOf(spec.appType);
    const clientFiles = engine === "react" ? reactFiles(spec) : vueFiles(spec);
    for (const [path, content] of Object.entries(clientFiles)) files.set(path, content);
  }

  // Service layer — when a database is selected.
  for (const [path, content] of Object.entries(serviceFiles(spec))) files.set(path, content);

  return files;
}

/** Project README, tailored to the chosen stack. */
function readmeMd(spec: ProjectSpec): string {
  const engine = engineOf(spec.appType);
  const stack = engine === "react"
    ? `React (\`.tsx\` pages) + ${uiLabel(spec.ui)}`
    : engine === "vue"
    ? `Vue (\`.vue\` SFC pages) + ${uiLabel(spec.ui)}`
    : "API-only";

  const lines: string[] = [
    `# ${spec.name}`,
    "",
    `A [Howl](https://jsr.io/@hushkey/howl) app — **${stack}**. No Vite; Deno + esbuild.`,
    "",
    "## Run",
    "",
    "```sh",
    "deno task dev      # dev server (live reload) on :8000",
    "deno task build    # production build → dist/",
    "deno task start    # run the built server",
    "```",
    "",
    "## What's here",
    "",
    "- `server/main.ts` — the Howl app.",
    "- `server/apis/**/*.api.ts` — typed API routes (sample: `public/ping`).",
    "- `dev.ts` — build/dev wiring (HowlBuilder + plugins).",
    "- `generated/http-client.ts` — a typed client generated from your APIs at build time.",
  ];

  if (engine !== null) {
    lines.push("- `client/pages/**` — file-system-routed pages (SSR → hydrate → SPA).");
    lines.push("- `static/style.css` — Tailwind v4 entry.");
    if (spec.ui === "shadcn") {
      lines.push("- `client/components/ui/**` — vendored shadcn/ui components (yours to edit).");
    }
  }

  if (spec.service !== "none") {
    lines.push(
      "- `server/services/**` — the " + spec.service + " service layer (sample: `items`).",
    );
    lines.push("");
    lines.push("## Admin (Studio)");
    lines.push("");
    lines.push("An admin UI over your services is mounted at **`/studio`**.");
    if (spec.service === "postgres") {
      lines.push("");
      lines.push(
        "Set `PG_URL` to use a real Postgres server; without it the app uses an embedded PGlite database under `data/`.",
      );
    }
    if (spec.service === "mongo") {
      lines.push("");
      lines.push("Set `MONGO_URL` (defaults to `mongodb://localhost:27017`).");
    }
  }

  lines.push("");
  return lines.join("\n");
}

function uiLabel(ui: ProjectSpec["ui"]): string {
  if (ui === "shadcn") return "shadcn/ui";
  if (ui === "daisyui") return "daisyUI";
  if (ui === "tailwind") return "Tailwind";
  return "Tailwind";
}
