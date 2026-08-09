import { z } from "zod";
import { documentSchema } from "@hushkey/service-core";

export const sessionsSchema = documentSchema({
  // The user lives in SQLite; ids travel across databases, joins never do.
  user_id: z.string(),
  // Epoch millis — indexed as a `number` path, so expiry sweeps are a ZSET
  // range instead of a scan.
  expires_at: z.number(),
  user_agent: z.string().default(""),
});

export type Session = z.infer<typeof sessionsSchema>;
