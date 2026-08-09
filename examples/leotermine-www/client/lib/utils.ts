import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind conflict resolution — the standard shadcn/ui
 * helper. `clsx` flattens conditionals, `tailwind-merge` dedupes conflicting
 * Tailwind utilities (e.g. `px-2 px-4` → `px-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * CSS custom properties that re-theme a subtree to a project's accent hue.
 * Spread onto a `style` prop **together with the `hued` class**, which is what
 * picks the light or dark pair for the current theme.
 *
 * Both pairs are emitted as literal colours rather than derived from
 * `var(--hue)` at the root: custom properties are substituted where they are
 * *declared*, so an `--accent` living on `:root` would keep the root hue no
 * matter what a descendant sets `--hue` to.
 */
export function hueVars(hue: number): Record<string, string> {
  return {
    "--hue": String(hue),
    "--accent-l": `oklch(0.55 0.14 ${hue})`,
    "--accent-soft-l": `oklch(0.94 0.03 ${hue})`,
    "--accent-d": `oklch(0.78 0.13 ${hue})`,
    "--accent-soft-d": `oklch(0.33 0.07 ${hue})`,
  };
}
