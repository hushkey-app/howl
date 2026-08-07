/**
 * Light/dark theme.
 *
 * The resolved theme is written to `data-theme` on `<html>` by a blocking
 * script in `_app.tsx` before first paint, so there is never a flash of the
 * wrong palette. This module only reads and flips that attribute afterwards —
 * it deliberately does not decide the initial value, because by the time React
 * runs the decision has already been made.
 */

/** The two palettes. */
export type Theme = "light" | "dark";

/** Key the choice is stored under, shared with the inline boot script. */
export const THEME_KEY = "leotermine:theme";

const listeners = new Set<() => void>();

/** The theme currently applied. Reports `light` during SSR. */
export function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Apply a theme and remember it. */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private browsing — the choice just does not survive the tab.
  }
  for (const listener of listeners) listener();
}

/** Flip to the other palette. */
export function toggleTheme(): void {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

/** Subscribe to theme changes. Returns the unsubscribe function. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The script inlined into `<head>`. Runs before the first paint: reads the
 * stored choice, falls back to the OS preference, and stamps `data-theme` on
 * `<html>` so the CSS resolves correctly on the very first frame.
 */
export const THEME_BOOT_SCRIPT =
  `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;
