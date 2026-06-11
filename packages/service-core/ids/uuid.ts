/**
 * UUID v7 generation — time-ordered ids for SQL-backed primary keys.
 *
 * A v4 (random) id as a B-tree primary key scatters inserts across the index
 * (page splits, poor cache locality) and never sorts by creation time. v7
 * leads with a 48-bit millisecond timestamp, so inserts are append-mostly and
 * ids order chronologically — the same property Mongo's `ObjectId` has had
 * all along.
 *
 * @module
 */

/**
 * Generate a UUID v7: 48-bit Unix-millisecond timestamp, then random bits,
 * with the standard version/variant markers. Lexicographic order follows
 * creation time at millisecond resolution.
 *
 * @returns The id in canonical 8-4-4-4-12 hex form.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ts = BigInt(Date.now());
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${
    hex.slice(20)
  }`;
}
