import { PgService } from "@hushkey/pg-service";
import { pgClient } from "../connections.ts";
import { type Blog, blogsSchema } from "./blogs.schema.ts";

export class BlogsService extends PgService<Blog> {
  constructor() {
    super(pgClient, blogsSchema, {
      collectionName: "blogs",
      uniqueFields: ["slug"],
      // Promoted to typed generated columns → real B-tree indexes for the
      // hot predicates; everything else stays JSONB.
      promote: [
        { path: "is_tech", type: "boolean" },
        { path: "published", type: "boolean" },
        { path: "likes", type: "numeric" },
      ],
    });
  }

  published(): Promise<Blog[]> {
    return this.find({
      query: { published: true },
      sort: { likes: -1 },
    });
  }

  bySlug(slug: string): Promise<Blog | null> {
    return this.find({ query: { slug }, limit: 1 }).then((r) => r[0] ?? null);
  }
}

export const blogsService = new BlogsService();
