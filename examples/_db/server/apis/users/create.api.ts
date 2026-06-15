import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { usersService } from "../../services/users/users.service.ts";

export default defineApi({
  name: "Create User",
  directory: "users",
  method: "POST",
  roles: [],
  requestBody: z.object({
    email: z.email(),
    name: z.string().min(1),
    role: z.enum(["reader", "author"]).optional(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
  },
  handler: async (ctx) => {
    const data = await usersService.create(ctx.req.body, { executionerId: "api" });
    return { status: 200, data };
  },
});
