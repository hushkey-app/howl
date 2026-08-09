import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { sessionsService } from "../../services/sessions/sessions.service.ts";

export default defineApi({
  name: "Revoke Session",
  directory: "sessions",
  method: "POST",
  roles: [],
  requestBody: z.object({ id: z.string() }),
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
    // Soft delete: the document and its index entries stay, the id just leaves
    // the active zset — so reads stop finding it and a restore is one command.
    const result = await sessionsService.delete(ctx.req.body.id, { executionerId: "console" });
    if (!result) return { status: 404, message: "session not found" };
    return { status: 200, data: result.item };
  },
});
