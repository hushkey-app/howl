import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { reviewsService } from "../../services/reviews/reviews.service.ts";
import { blogsService } from "../../services/blogs/blogs.service.ts";
import { usersService } from "../../services/users/users.service.ts";

export default defineApi({
  name: "Create Review",
  directory: "reviews",
  method: "POST",
  roles: [],
  requestBody: z.object({
    blog_id: z.string(),
    author_id: z.string(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
    404: z.object({ message: z.string() }),
    503: z.object({ message: z.string() }),
  },
  handler: async (ctx) => {
    if (!reviewsService) {
      return { status: 503, message: "MongoDB not configured — set MONGO_URL and restart" };
    }
    // Integrity across all three databases: blog in Postgres, author in SQLite.
    const [blog, author] = await Promise.all([
      blogsService.get(ctx.req.body.blog_id),
      usersService.get(ctx.req.body.author_id),
    ]);
    if (!blog) return { status: 404, message: `blog ${ctx.req.body.blog_id} not found` };
    if (!author) return { status: 404, message: `author ${ctx.req.body.author_id} not found` };

    const data = await reviewsService.create(ctx.req.body, { executionerId: author.id });
    return { status: 200, data };
  },
});
