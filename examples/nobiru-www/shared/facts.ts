/**
 * Everything the landing page claims about Nobiru, in one place — imported by
 * both the server (state injection) and the pages (copy). Counts come from the
 * shipped bundle (`Exercises.json`, `Foods.json` in the Xcode project, which is
 * still named `MyGym/` on disk); keep them in sync with the app release.
 */

/** App Store listing. Replace with the real product URL at launch. */
export const APP_STORE_URL = "https://apps.apple.com/app/id0000000000";

/** One-time unlock price, formatted for display. */
export const PRICE = "$9.99";

/** Exercises in the bundled catalogue right now (`Exercises.json`). */
export const EXERCISE_COUNT = 721;

/**
 * How the library is described on the site. Written as a ceiling so the copy
 * survives the catalogue growing between releases. Capitalised for headings;
 * lower-case it mid-sentence.
 */
export const EXERCISE_CLAIM = "Up to 1,000";

/** Foods in the bundled offline nutrition database. */
export const FOOD_COUNT = 5772;

/** Minimum iOS version the app supports (Xcode deployment target). */
export const IOS_MIN = "iOS 26.5";

/** Minimum watchOS version for the companion app. */
export const WATCHOS_MIN = "watchOS 10";

/** Gym presets offered during onboarding — they filter every exercise swap. */
export const GYM_PRESETS = [
  "Home Gym",
  "Commercial Gym",
  "Bodyweight Only",
  "Minimal Equipment",
] as const;
