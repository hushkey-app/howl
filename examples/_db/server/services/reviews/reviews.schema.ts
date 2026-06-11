import { z } from "zod";
import { documentSchema } from "@hushkey/service-core";

export const reviewsSchema = documentSchema({
  // Cross-database references by string id: the blog lives in Postgres, the
  // author in SQLite. Ids travel; joins never do.
  blog_id: z.string(),
  author_id: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().default(""),
});

export type Review = z.infer<typeof reviewsSchema>;
