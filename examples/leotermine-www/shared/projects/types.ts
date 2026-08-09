/**
 * The shape every project data file fills in. Adding a project to the site is
 * one file in this directory plus one line in `index.ts` — no new pages: the
 * `/[project]` routes render whatever is declared here.
 */

/**
 * The languages the filter knows about. A closed union on purpose — adding a
 * sixth chip should be a deliberate edit here, not a side effect of typing a
 * new string into a project file.
 */
export type Language =
  | "TypeScript"
  | "Rust"
  | "Swift"
  | "React"
  | "React Native"
  | "Vue"
  | "WebAssembly";

/** An outbound link on a project card. */
export interface ProjectLink {
  /** Button label, e.g. "App Store". */
  label: string;
  /** Absolute destination. */
  href: string;
  /**
   * Icon key resolved by the card renderer. Unknown keys fall back to a
   * generic arrow.
   */
  icon?: "apple" | "github" | "globe" | "docs" | "play";
  /** Render as the card's primary action. At most one per project. */
  primary?: boolean;
}

/** A titled block of prose — the unit both hosted pages are built from. */
export interface ContentSection {
  /** Section heading. */
  title: string;
  /** Body copy. Plain text; one paragraph per section keeps the pages scannable. */
  body: string;
}

/** A support question and its answer. */
export interface FaqEntry {
  /** The question, phrased the way a user would ask it. */
  question: string;
  /** The answer. */
  answer: string;
}

/**
 * Everything needed to host `/{slug}/privacy` and `/{slug}/support` for a
 * shipped app. Omit on projects that live entirely on their own domain.
 */
export interface ProjectSupport {
  /** Platforms the app runs on, listed on the support page. */
  platforms: string[];
  /** Current shipping version, or `undefined` while unreleased. */
  version?: string;
  /** Minimum OS requirement, e.g. "iOS 26.5". */
  requires?: string;
  /** Price as displayed, e.g. "$9.99 once". */
  price?: string;
  /** Address support mail goes to. */
  contactEmail: string;
  /** Typical first-reply time, stated so expectations are set. */
  responseTime: string;
  /** Sections of the privacy policy, in reading order. */
  privacy: ContentSection[];
  /** Date the privacy policy last changed, ISO `YYYY-MM-DD`. */
  privacyUpdated: string;
  /** Support FAQ, most-asked first. */
  faq: FaqEntry[];
  /** Extra prose blocks under the FAQ — troubleshooting, data export, refunds. */
  guides?: ContentSection[];
}

/** A single project as shown on the site. */
export interface Project {
  /** URL segment and stable identity, e.g. `nobiru`. */
  slug: string;
  /** Display name. */
  name: string;
  /** Six-or-so words under the name on the card. */
  tagline: string;
  /** Two or three sentences — what it is and why it exists. */
  summary: string;
  /** Year or span shown in the card's meta line. */
  year: string;
  /** Where the project is in its life. Drives the status pill. */
  status: "live" | "beta" | "open source" | "building";
  /**
   * oklch hue angle (0–360) for this project's accent. The card, the hosted
   * pages and the glass tint all derive from it, so one number re-themes a
   * project everywhere.
   */
  hue: number;
  /**
   * Languages this project is written in — and the only thing the filter bar
   * offers. Frameworks, datastores and platforms deliberately stay out of it:
   * they belong in `summary`, where they read as prose instead of piling up as
   * a dozen near-useless chips.
   */
  languages: Language[];
  /**
   * Cover image for the card, served from `static/`. Real screenshots only —
   * projects without a public site omit this and get a generated panel in
   * their accent instead, which is honest about there being nothing to show.
   */
  cover?: string;
  /**
   * App icon, served from `static/`. Used where there is no site to screenshot
   * but the product does have a mark of its own — it is shown floating on the
   * project's accent rather than stretched into a fake cover.
   */
  icon?: string;
  /** Outbound links. */
  links: ProjectLink[];
  /** Show in the featured band above the grid. */
  featured?: boolean;
  /** Present when this site hosts the project's privacy and support pages. */
  support?: ProjectSupport;
}
