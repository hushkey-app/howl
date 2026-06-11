import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { reviewsService } from "../../services/reviews/reviews.service.ts";

export default defineApi({
  name: "List Reviews",
  directory: "reviews",
  method: "GET",
  roles: [],
  query: z.object({
    blog_id: z.string().optional(),
    min_rating: z.coerce.number().optional(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
    503: z.object({ message: z.string() }),
  },
  handler: async (ctx) => {
    if (!reviewsService) {
      return { status: 503, message: "MongoDB not configured — set MONGO_URL and restart" };
    }
    const { blog_id, min_rating } = ctx.query();
    if (blog_id) {
      return { status: 200, data: await reviewsService.topForBlog(blog_id, min_rating ?? 1) };
    }
    const query: Record<string, unknown> = {};
    if (min_rating !== undefined) query.rating = { $gte: min_rating };
    const data = await reviewsService.find({ query, sort: { rating: -1 } });
    return { status: 200, data };
  },
});
