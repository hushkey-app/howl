/**
 * Who the site is about. Imported by the server (state injection) and by pages
 * (copy), so there is exactly one place to correct a fact.
 *
 * Deliberately public-safe: no phone number and no personal inbox. The address
 * below is the one handed out publicly — point it wherever you like.
 */

/** Display name used in headings, OG tags and the CV sheet. */
export const NAME = "Leo Termine";

/** One-line role, shown under the name in the hero. */
export const ROLE = "Software Engineer";

/** Where he works from. */
export const LOCATION = "Perth, Western Australia";

/** Canonical origin — used for absolute OG/canonical URLs. */
export const ORIGIN = "https://leotermine.com";

/**
 * The only address published on the site. Forward it to a real inbox; the
 * personal one never appears in markup, so scrapers get this instead.
 */
export const EMAIL = "hello@leotermine.com";

/** Portrait shown in the intro. Drop the file in `static/`. */
export const PORTRAIT = "/portrait.jpg";

/** An off-site presence. */
export interface SocialLink {
  /** Label shown next to the link. */
  label: string;
  /** Absolute destination. */
  href: string;
  /** Short handle or domain shown under the label. */
  handle: string;
}

/**
 * Off-site profiles for the Reach out section.
 *
 * Howl and Hushkey used to sit here too and were removed: both are projects
 * with their own cards and pages, so listing them again as "places to find me"
 * said the same thing a third time.
 */
export const SOCIALS: SocialLink[] = [
  { label: "GitHub", href: "https://github.com/mirairoad", handle: "@mirairoad" },
];
