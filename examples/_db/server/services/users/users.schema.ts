import { z } from "zod";
import { documentSchema } from "@hushkey/service-core";

export const usersSchema = documentSchema({
  email: z.email(),
  name: z.string().min(1),
  role: z.enum(["reader", "author"]).default("reader"),
});

export type User = z.infer<typeof usersSchema>;
