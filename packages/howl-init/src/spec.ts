import type { PromptDeps } from "./prompt.ts";

/** The kind of app to scaffold. */
export type AppType = "backend" | "fullstack-react" | "fullstack-vue";

/** Frontend styling baseline for fullstack apps. */
export type UiKit = "tailwind" | "daisyui" | "shadcn";

/** Optional document-store service layer (service-core + a storage backend). */
export type ServiceLayer = "none" | "sqlite" | "postgres" | "mongo";

/**
 * A fully-resolved project description — everything {@link buildProjectFiles}
 * needs to emit a project. Produced by {@link gatherSpec} from CLI flags +
 * prompts.
 */
export interface ProjectSpec {
  /** Project name — target folder and `deno.json#name`. */
  name: string;
  /** Backend-only, or fullstack with a React / Vue engine. */
  appType: AppType;
  /** Frontend styling kit; `"none"` for backend-only apps. */
  ui: UiKit | "none";
  /** Document-store backend, or `"none"` to skip the service layer + Studio. */
  service: ServiceLayer;
}

/** App-type picker options, in display order. */
export const APP_TYPE_OPTIONS: { label: string; description: string; value: AppType }[] = [
  {
    label: "backend",
    description: "API-only: typed routes, OpenAPI, generated http client. No frontend.",
    value: "backend",
  },
  {
    label: "fullstack-react",
    description: "React engine (.tsx pages, SSR → hydrate → SPA) + API + http client.",
    value: "fullstack-react",
  },
  {
    label: "fullstack-vue",
    description: "Vue engine (.vue SFC pages, SSR → hydrate → SPA) + API + http client.",
    value: "fullstack-vue",
  },
];

/** Service-layer picker options, in display order. */
export const SERVICE_OPTIONS: { label: string; description: string; value: ServiceLayer }[] = [
  { label: "none", description: "No database — skip the service layer and Studio.", value: "none" },
  {
    label: "sqlite",
    description: "SQLite via node:sqlite — zero infra, a file on disk. + Studio admin.",
    value: "sqlite",
  },
  {
    label: "postgres",
    description: "Postgres (PG_URL), embedded PGlite fallback for local dev. + Studio admin.",
    value: "postgres",
  },
  {
    label: "mongo",
    description: "MongoDB (MONGO_URL). + Studio admin.",
    value: "mongo",
  },
];

/** Whether the app ships a frontend (any engine). */
export function isFullstack(spec: Pick<ProjectSpec, "appType">): boolean {
  return spec.appType !== "backend";
}

/** The render engine an app uses, or `null` for backend-only. */
export function engineOf(appType: AppType): "react" | "vue" | null {
  if (appType === "fullstack-react") return "react";
  if (appType === "fullstack-vue") return "vue";
  return null;
}

/** UI-kit options available for an app type (shadcn is React-only). */
export function uiKitsFor(
  appType: AppType,
): { label: string; description: string; value: UiKit }[] {
  if (appType === "fullstack-react") {
    return [
      {
        label: "shadcn/ui",
        description: "Radix + CVA components, vendored into the project.",
        value: "shadcn",
      },
      {
        label: "daisyUI",
        description: "Tailwind component classes (btn, card, …).",
        value: "daisyui",
      },
      {
        label: "Tailwind only",
        description: "Plain Tailwind v4 utilities, no component library.",
        value: "tailwind",
      },
    ];
  }
  if (appType === "fullstack-vue") {
    return [
      {
        label: "daisyUI",
        description: "Tailwind component classes (btn, card, …).",
        value: "daisyui",
      },
      {
        label: "Tailwind only",
        description: "Plain Tailwind v4 utilities, no component library.",
        value: "tailwind",
      },
    ];
  }
  return [];
}

const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Throws if `name` isn't a safe folder / package name. */
export function validateProjectName(name: string): void {
  if (!PROJECT_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid project name "${name}" — use letters, digits, '-', '_', '.' (must start with a letter or digit)`,
    );
  }
}

/** Partial spec from CLI flags; missing fields are filled by prompts. */
export interface SpecOverrides {
  /** Project name (CLI `--name` / positional). */
  name?: string;
  /** App type (CLI `--type`). */
  appType?: AppType;
  /** UI kit (CLI `--ui`). */
  ui?: UiKit;
  /** Service layer (CLI `--service`). */
  service?: ServiceLayer;
}

/**
 * Resolve a full {@link ProjectSpec} from CLI overrides, prompting (via
 * `prompts`) only for what's missing. Order: name → app type → UI kit
 * (fullstack only) → service layer.
 */
export function gatherSpec(overrides: SpecOverrides, prompts: PromptDeps): ProjectSpec {
  const name = (overrides.name ?? prompts.ask("Project name", "my-howl-app")).trim();
  if (!name) throw new Error("Project name is required");
  validateProjectName(name);

  const appType = overrides.appType ??
    prompts.pick("App type", APP_TYPE_OPTIONS);

  let ui: UiKit | "none" = "none";
  if (isFullstack({ appType })) {
    const kits = uiKitsFor(appType);
    if (overrides.ui !== undefined) {
      if (!kits.some((k) => k.value === overrides.ui)) {
        const allowed = kits.map((k) => k.value).join(", ");
        throw new Error(`UI kit "${overrides.ui}" is not valid for ${appType}. Choose: ${allowed}`);
      }
      ui = overrides.ui;
    } else {
      ui = prompts.pick("UI kit", kits);
    }
  }

  const service = overrides.service ??
    prompts.pick("Service layer (database)", SERVICE_OPTIONS);

  return { name, appType, ui, service };
}
