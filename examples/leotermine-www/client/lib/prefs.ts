/**
 * The two switches on the board that are not the theme: the falling stars and
 * the interface sound.
 *
 * Both follow the same pattern `theme.ts` uses — the value is stamped onto
 * `<html>` by a blocking script before first paint, and this module only reads
 * and flips it afterwards. That matters for the stars: deciding in React would
 * mean a frame of animation starting before the stored "off" was read, which is
 * exactly the thing someone who turned it off does not want to see.
 */

/** A switch on the board. */
export type Pref = "stars" | "sound";

/** Keys the choices are stored under, shared with the inline boot script. */
export const PREF_KEYS: Record<Pref, string> = {
  stars: "leotermine:stars",
  sound: "leotermine:sound",
};

/** The `<html>` data attribute each switch is stamped onto. */
const ATTRS: Record<Pref, string> = {
  stars: "stars",
  sound: "sound",
};

const listeners = new Set<() => void>();

/** Whether a switch is on. Reports the default during SSR. */
export function getPref(pref: Pref): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.dataset[ATTRS[pref]] !== "off";
}

/** Set a switch and remember it. */
export function setPref(pref: Pref, on: boolean): void {
  document.documentElement.dataset[ATTRS[pref]] = on ? "on" : "off";
  try {
    localStorage.setItem(PREF_KEYS[pref], on ? "on" : "off");
  } catch {
    // Private browsing — the choice just does not survive the tab.
  }
  for (const listener of listeners) listener();
}

/** Flip a switch. */
export function togglePref(pref: Pref): void {
  setPref(pref, !getPref(pref));
}

/** Subscribe to switch changes. Returns the unsubscribe function. */
export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The script inlined into `<head>`, alongside the theme's. Both switches
 * default to on, so only an explicit "off" is read back.
 */
export const PREFS_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;` +
  `d.dataset.stars=localStorage.getItem("${PREF_KEYS.stars}")==="off"?"off":"on";` +
  `d.dataset.sound=localStorage.getItem("${PREF_KEYS.sound}")==="off"?"off":"on"}` +
  `catch(e){}})()`;
