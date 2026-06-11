/**
 * Studio theming. The UI is styled with daisyUI (loaded from CDN in standalone
 * mode, or provided by the host app in component mode), so colors come from the
 * active daisyUI **theme** via `data-theme` rather than a hand-rolled palette.
 * This module only keeps the theme-name type and the per-backend accent mapping
 * to daisyUI semantic color classes.
 *
 * @module
 */

/** A daisyUI theme name. The two built-ins are `dark` and `light`; any theme
 * the host loads (e.g. via `daisyui@5/themes.css`) also works. */
export type ThemeName = string;

/** daisyUI semantic-color class trio for one backend accent. */
export interface Accent {
  /** Text color class, e.g. `text-success`. */
  text: string;
  /** Background color class, e.g. `bg-success`. */
  bg: string;
  /** Border color class, e.g. `border-success`. */
  border: string;
}

const ACCENTS: Record<string, Accent> = {
  mongo: { text: "text-success", bg: "bg-success", border: "border-success" },
  sql: { text: "text-info", bg: "bg-info", border: "border-info" },
  sqlite: { text: "text-warning", bg: "bg-warning", border: "border-warning" },
};

const FALLBACK: Accent = { text: "text-accent", bg: "bg-accent", border: "border-accent" };

/** daisyUI accent classes for a backend kind (sqlite warning, sql info, mongo
 * success), with a neutral accent fallback. */
export function backendAccent(backend: string): Accent {
  return ACCENTS[backend] ?? FALLBACK;
}
