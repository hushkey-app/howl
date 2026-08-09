import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { sessionsService } from "../../services/sessions/sessions.service.ts";
import { usersService } from "../../services/users/users.service.ts";

const HOUR = 60 * 60 * 1000;

export default defineApi({
  name: "Create Session",
  directory: "sessions",
  method: "POST",
  roles: [],
  requestBody: z.object({
    user_id: z.string(),
    ttl_hours: z.number().int().min(1).max(24 * 30).default(24),
    user_agent: z.string().optional(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
    404: z.object({ message: z.string() }),
    503: z.object({ message: z.string() }),
  },
  handler: async (ctx) => {
    if (!sessionsService) {
      return {
        status: 503,
        message: "Redis offline — start one on 127.0.0.1:6379 (REDIS_URL overrides), then restart",
      };
    }
    // The session lives in Redis, its user in SQLite — integrity across stores.
    const user = await usersService.get(ctx.req.body.user_id);
    if (!user) return { status: 404, message: `user ${ctx.req.body.user_id} not found` };

    const data = await sessionsService.create({
      user_id: user.id,
      expires_at: Date.now() + ctx.req.body.ttl_hours * HOUR,
      user_agent: ctx.req.body.user_agent ?? ctx.req.headers.get("user-agent") ?? "",
    }, { executionerId: user.id });
    return { status: 200, data };
  },
});
