import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { blogsService } from "../../services/blogs/blogs.service.ts";
import type { Blog } from "../../services/blogs/blogs.schema.ts";

export default defineApi({
  name: "Like Blog",
  directory: "blogs",
  method: "POST",
  roles: [],
  requestBody: z.object({
    id: z.string(),
    // Demo switch: send the write with a wrong expected version so the
    // optimistic lock rejects it — shows the 409 path in the UI.
    stale: z.boolean().optional(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
    404: z.object({ message: z.string() }),
    409: z.object({ message: z.string() }),
  },
  handler: async (ctx) => {
    const blog = await blogsService.get(ctx.req.body.id);
    if (!blog) return { status: 404, message: "blog not found" };
    try {
      const data = await blogsService.patch(blog.id, {
        likes: blog.likes + 1,
        ...(ctx.req.body.stale ? { version: blog.version + 1000 } : {}),
      } as Partial<Blog>, { executionerId: "console" });
      return { status: 200, data };
    } catch (error) {
      return { status: 409, message: (error as Error).message };
    }
  },
});
