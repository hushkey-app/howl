import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { sessionsService } from "../../services/sessions/sessions.service.ts";

const OFFLINE = "Redis offline — start one on 127.0.0.1:6379 (REDIS_URL overrides), then restart";

export default defineApi({
  name: "List Sessions",
  directory: "sessions",
  method: "GET",
  roles: [],
  query: z.object({
    user_id: z.string().optional(),
    expired: z.coerce.boolean().optional(),
  }),
  responses: {
    200: z.object({ data: z.any() }),
    503: z.object({ message: z.string() }),
  },
  handler: async (ctx) => {
    if (!sessionsService) return { status: 503, message: OFFLINE };
    const { user_id, expired } = ctx.query();
    // Both paths are indexed: user_id intersects a SET, expired ranges a ZSET.
    if (user_id) return { status: 200, data: await sessionsService.forUser(user_id) };
    if (expired) return { status: 200, data: await sessionsService.expired() };
    return { status: 200, data: await sessionsService.find({ sort: { expires_at: -1 } }) };
  },
});
