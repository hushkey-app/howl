import { z } from "zod";
import { documentSchema } from "@hushkey/service-core";

export const blogsSchema = documentSchema({
  title: z.string().min(1),
  slug: z.string().min(1),
  body: z.string().default(""),
  published: z.boolean().default(false),
  likes: z.number().int().default(0),
  // Cross-database reference by string id (users live in SQLite). The service
  // layer never joins — integrity yes, navigation no.
  author_id: z.string(),
});

export type Blog = z.infer<typeof blogsSchema>;
