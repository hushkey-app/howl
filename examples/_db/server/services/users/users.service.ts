import { SqliteService } from "@hushkey/sqlite-service";
import { sqliteDb } from "../connections.ts";
import { type User, usersSchema } from "./users.schema.ts";

// Domain service subclass — the hushkey pattern: storage wiring in the
// constructor, domain queries as methods. Email lookup lives here, not in
// the core contract (get() is id-only).
export class UsersService extends SqliteService<User> {
  constructor() {
    super(sqliteDb, usersSchema, {
      collectionName: "users",
      uniqueFields: ["email"],
    });
  }

  async getByEmail(email: string): Promise<User | null> {
    const matches = await this.find({ query: { email }, limit: 1 });
    return matches[0] ?? null;
  }
}

export const usersService = new UsersService();
