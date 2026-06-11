import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { usersService } from "../../services/users/users.service.ts";

export default defineApi({
  name: "List Users",
  directory: "users",
  method: "GET",
  roles: [],
  query: z.object({
    role: z.enum(["reader", "author"]).optional(),
    email: z.email().optional(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
  },
  handler: async (ctx) => {
    const { role, email } = ctx.query();
    if (email) {
      // Domain method, not a contract primitive — get() is id-only.
      return { status: 200, data: await usersService.getByEmail(email) };
    }
    const data = await usersService.find({
      query: role ? { role } : {},
      sort: { name: 1 },
    });
    return { status: 200, data };
  },
});
