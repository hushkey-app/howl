import { z } from "zod";
import { documentSchema } from "@hushkey/service-core";

export const usersSchema = documentSchema({
  email: z.email(),
  name: z.string().min(1),
  type: z.string().default("alias"),
  mobile_numbers: z.array(z.object({
    number: z.number(),
  })).default([]),
});

export type User = z.infer<typeof usersSchema>;
