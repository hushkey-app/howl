import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { blogsService } from "../../services/blogs/blogs.service.ts";

export default defineApi({
  name: "List Blogs",
  directory: "blogs",
  method: "GET",
  roles: [],
  query: z.object({
    published: z.stringbool().optional(),
    min_likes: z.coerce.number().optional(),
    slug: z.string().optional(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
  },
  handler: async (ctx) => {
    const { published, min_likes, slug } = ctx.query();
    if (slug) return { status: 200, data: await blogsService.bySlug(slug) };

    const query: Record<string, unknown> = {};
    if (published !== undefined) query.published = published; // promoted boolean column
    if (min_likes !== undefined) query.likes = { $gte: min_likes }; // promoted numeric column
    const data = await blogsService.find({ query, sort: { likes: -1 } });
    return { status: 200, data };
  },
});
