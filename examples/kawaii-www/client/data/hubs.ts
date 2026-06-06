/**
 * Shared hub data for kawaii(x,y) — the four delivery cities whose office hours
 * stitch together into 24h of continuous coverage. Used by the hero coverage
 * card, the signature timeline, and the contact-page clocks so the three views
 * never drift apart.
 */

/** A single delivery hub (one of the four time-zone offices). */
export interface Hub {
  /** City name shown in the UI. */
  city: string;
  /** Country, for the contact "based in" copy. */
  country: string;
  /** IANA time-zone id used by `Intl.DateTimeFormat` for the live clocks. */
  tz: string;
  /** Human-readable zone label, e.g. `"JST · UTC+9"`. */
  zone: string;
  /**
   * Office-hours bands in UTC hours `[start, end)` across the 0–24 timeline.
   * San Francisco wraps midnight, so it carries two bands.
   */
  bands: [number, number][];
}

/** The four hubs, ordered west-of-day-start → end so handoffs read left→right. */
export const HUBS: Hub[] = [
  { city: "Tokyo", country: "Japan", tz: "Asia/Tokyo", zone: "JST · UTC+9", bands: [[0, 10]] },
  { city: "Perth", country: "Australia", tz: "Australia/Perth", zone: "AWST · UTC+8", bands: [[1, 11]] },
  { city: "Palermo", country: "Italy", tz: "Europe/Rome", zone: "CEST · UTC+2", bands: [[7, 17]] },
  {
    city: "San Francisco",
    country: "USA",
    tz: "America/Los_Angeles",
    zone: "PDT · UTC-7",
    bands: [[16, 24], [0, 2]],
  },
];

/** Local office-day start hour (inclusive) used to flag a hub "Active". */
export const OFFICE_START = 9;
/** Local office-day end hour (exclusive) used to flag a hub "Active". */
export const OFFICE_END = 19;
