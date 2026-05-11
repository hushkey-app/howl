/**
 * Registry of templates the scaffolder can produce.
 */
export interface TemplateMeta {
  /** Folder name under `templates/` and CLI flag value. */
  id: string;
  /** Human label shown in the picker. */
  label: string;
  /** One-line description shown next to the label. */
  description: string;
}

/** Templates currently shipped. Add an entry plus a `templates/<id>/` folder to expose a new one. */
export const templates: readonly TemplateMeta[] = [
  {
    id: "backend-only",
    label: "backend-only",
    description: "Minimal API-only project with sample ping (GET) + pong (POST) routes",
  },
  {
    id: "fullstack",
    label: "fullstack",
    description: "Minimal fullstack starter — 1 API, 1 page, 1 island, 1 signal-based component, Tailwind",
  },
  {
    id: "docs",
    label: "docs",
    description: "Tailwind + daisyUI docs site with JSON-driven content",
  },
  {
    id: "cv",
    label: "cv",
    description: "Tailwind + daisyUI developer CV / portfolio with project cards",
  },
  {
    id: "aot-spa",
    label: "aot-spa",
    description: "AOT navigation demo — SSR, AOT, and SSG pages side-by-side with a nav bar to compare them",
  },
] as const;

/** Look up a template by id. Returns `undefined` if unknown. */
export function findTemplate(id: string): TemplateMeta | undefined {
  return templates.find((t) => t.id === id);
}
