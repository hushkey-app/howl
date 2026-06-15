import type { ProjectSpec, ServiceLayer } from "../spec.ts";

/** All service-layer files for a project with a database backend. */
export function serviceFiles(spec: ProjectSpec): Record<string, string> {
  if (spec.service === "none") return {};
  return {
    "server/services/connections.ts": connectionsTs(spec.service, spec.name),
    "server/services/items/items.schema.ts": itemsSchemaTs(),
    "server/services/items/items.service.ts": itemsServiceTs(spec.service),
  };
}

function connectionsTs(service: ServiceLayer, name: string): string {
  if (service === "sqlite") {
    return `import { DatabaseSync } from "node:sqlite";
import type { SqliteDbLike } from "@hushkey/sqlite-service";

// SQLite via node:sqlite — a single file on disk, zero infrastructure.
const dataDir = \`\${import.meta.dirname}/../../data\`;
Deno.mkdirSync(dataDir, { recursive: true });

export const sqliteDb: SqliteDbLike = new DatabaseSync(
  \`\${dataDir}/app.db\`,
) as unknown as SqliteDbLike;
`;
  }
  if (service === "postgres") {
    return `import type { PgClientLike } from "@hushkey/pg-service";

// Postgres via PG_URL, or an embedded PGlite database for local dev when unset.
const dataDir = \`\${import.meta.dirname}/../../data\`;
Deno.mkdirSync(dataDir, { recursive: true });

export const pgClient: PgClientLike = await (async () => {
  const url = Deno.env.get("PG_URL");
  if (url) {
    const { default: pg } = await import("pg");
    return new pg.Pool({ connectionString: url }) as unknown as PgClientLike;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  return await PGlite.create(\`\${dataDir}/pglite\`) as unknown as PgClientLike;
})();
`;
  }
  // mongo
  return `import { type Db, MongoClient } from "mongodb";

// MongoDB via MONGO_URL (defaults to the standard local port).
const MONGO_URL = Deno.env.get("MONGO_URL") ?? "mongodb://localhost:27017";

const client = new MongoClient(MONGO_URL);
await client.connect();

export const mongoDb: Db = client.db("${name.replace(/[^a-zA-Z0-9_]/g, "_")}_db");
`;
}

function itemsSchemaTs(): string {
  return `import { z } from "zod";
import { documentSchema } from "@hushkey/service-core";

/** A simple "items" collection — extend with your own fields. */
export const itemsSchema = documentSchema({
  name: z.string().min(1),
  done: z.boolean().default(false),
});

export type Item = z.infer<typeof itemsSchema>;
`;
}

function itemsServiceTs(service: ServiceLayer): string {
  const cls = service === "sqlite"
    ? { import: "SqliteService", pkg: "@hushkey/sqlite-service", conn: "sqliteDb" }
    : service === "postgres"
    ? { import: "PgService", pkg: "@hushkey/pg-service", conn: "pgClient" }
    : { import: "MongoService", pkg: "@hushkey/mongo-service", conn: "mongoDb" };
  return `import { ${cls.import} } from "${cls.pkg}";
import { ${cls.conn} } from "../connections.ts";
import { type Item, itemsSchema } from "./items.schema.ts";

// Domain service — storage wiring in the constructor, domain queries as methods.
// Studio (mounted in server/main.ts) gives you an admin UI over this at /studio.
export class ItemsService extends ${cls.import}<Item> {
  constructor() {
    super(${cls.conn}, itemsSchema, { collectionName: "items" });
  }
}

export const itemsService = new ItemsService();
`;
}
