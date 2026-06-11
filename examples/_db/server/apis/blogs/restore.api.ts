import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { blogsService } from "../../services/blogs/blogs.service.ts";

export default defineApi({
  name: "Restore Blog",
  directory: "blogs",
  method: "POST",
  roles: [],
  requestBody: z.object({ id: z.string() }),
  responses: {
    200: z.object({ data: z.any() }),
    404: z.object({ message: z.string() }),
  },
  handler: async (ctx) => {
    const data = await blogsService.restore(ctx.req.body.id, { executionerId: "console" });
    if (!data) return { status: 404, message: "blog not found" };
    return { status: 200, data };
  },
});
