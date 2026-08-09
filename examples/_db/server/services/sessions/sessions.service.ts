import { RedisService } from "@hushkey/redis-service";
import { redisClient } from "../connections.ts";
import { type Session, sessionsSchema } from "./sessions.schema.ts";

// Redis as the database — the fast rung of the ladder, for data that is read
// constantly and expires. Declared paths get physical indexes: `user_id` a SET
// per value, `expires_at` a ZSET scored by the timestamp, so both queries below
// are set operations Redis runs itself rather than a scan.
export class SessionsService extends RedisService<Session> {
  constructor() {
    super(redisClient!, sessionsSchema, {
      collectionName: "sessions",
      index: ["user_id", { path: "expires_at", kind: "number" }],
      // No cache: this IS the fast store (the default, spelled out here).
      cache: { enabled: false },
    });
  }

  forUser(userId: string): Promise<Session[]> {
    return this.find({ query: { user_id: userId }, sort: { expires_at: -1 } });
  }

  expired(now = Date.now()): Promise<Session[]> {
    return this.find({ query: { expires_at: { $lt: now } } });
  }
}

// No embedded fallback — without a reachable Redis the service is null and the
// session endpoints answer 503 with a setup hint, like reviews on Mongo.
export const sessionsService: SessionsService | null = redisClient ? new SessionsService() : null;
