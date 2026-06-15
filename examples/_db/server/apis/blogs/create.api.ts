import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { blogsService } from "../../services/blogs/blogs.service.ts";
import { usersService } from "../../services/users/users.service.ts";

export default defineApi({
  name: "Create Blog",
  directory: "blogs",
  method: "POST",
  roles: [],
  requestBody: z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    body: z.string().optional(),
    published: z.boolean().optional(),
    author_id: z.string(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
    404: z.object({ message: z.string() }),
  },
  handler: async (ctx) => {
    // Cross-database integrity check by id — users live in SQLite, blogs in
    // Postgres. App-level enforcement; the layer never joins.
    const author = await usersService.get(ctx.req.body.author_id);
    if (!author) {
      return { status: 404, message: `author ${ctx.req.body.author_id} not found` };
    }
    const data = await blogsService.create(ctx.req.body, { executionerId: author.id });
    return { status: 200, data };
  },
});
