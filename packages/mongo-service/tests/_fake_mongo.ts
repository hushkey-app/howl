import { type Db, ObjectId } from "mongodb";

// A tiny in-memory MongoDB stand-in — just the operations MongoService calls.
// Not a general Mongo emulator: it supports equality + a handful of operators,
// dot-path matching, $set/$inc updates, projection, sort, skip, limit. Enough
// to drive the service contract without Docker. Real-storage conformance
// (testcontainers) is a separate, later suite.

// deno-lint-ignore no-explicit-any
type Doc = Record<string, any>;
// deno-lint-ignore no-explicit-any
type Query = Record<string, any>;

function eq(a: unknown, b: unknown): boolean {
  if (a instanceof ObjectId && b instanceof ObjectId) return a.equals(b);
  if (a instanceof ObjectId || b instanceof ObjectId) return false;
  return a === b;
}

function getPath(doc: Doc, key: string): unknown {
  if (key === "_id") return doc._id;
  return key.split(".").reduce<unknown>(
    (o, k) => (o == null ? undefined : (o as Doc)[k]),
    doc,
  );
}

// deno-lint-ignore no-explicit-any
function matchValue(actual: unknown, cond: any): boolean {
  // Mongo null equality matches both stored null and absent fields.
  if (cond === null) return actual === null || actual === undefined;
  if (cond instanceof ObjectId) return eq(actual, cond);
  if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
    for (const [op, val] of Object.entries(cond)) {
      switch (op) {
        case "$eq":
          if (val === null) {
            if (actual !== null && actual !== undefined) return false;
          } else if (!eq(actual, val)) return false;
          break;
        case "$in":
          if (!(val as unknown[]).some((v) => eq(actual, v))) return false;
          break;
        case "$nin":
          if ((val as unknown[]).some((v) => eq(actual, v))) return false;
          break;
        case "$ne":
          if (eq(actual, val)) return false;
          break;
        case "$gt":
          if (!((actual as number) > (val as number))) return false;
          break;
        case "$gte":
          if (!((actual as number) >= (val as number))) return false;
          break;
        case "$lt":
          if (!((actual as number) < (val as number))) return false;
          break;
        case "$lte":
          if (!((actual as number) <= (val as number))) return false;
          break;
        case "$exists":
          if ((actual !== undefined) !== val) return false;
          break;
        default:
          throw new Error(`FakeMongo: unsupported operator ${op}`);
      }
    }
    return true;
  }
  return eq(actual, cond);
}

function matchesQuery(doc: Doc, query: Query): boolean {
  for (const [key, cond] of Object.entries(query)) {
    if (key === "$and") {
      if (!(cond as Query[]).every((c) => matchesQuery(doc, c))) return false;
      continue;
    }
    if (key === "$or") {
      if (!(cond as Query[]).some((c) => matchesQuery(doc, c))) return false;
      continue;
    }
    if (!matchValue(getPath(doc, key), cond)) return false;
  }
  return true;
}

function applySet(doc: Doc, set: Doc): void {
  for (const [key, val] of Object.entries(set)) {
    const parts = key.split(".");
    let o = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      o[parts[i]] = o[parts[i]] ?? {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
  }
}

function applyInc(doc: Doc, inc: Doc): void {
  for (const [k, v] of Object.entries(inc)) doc[k] = (doc[k] ?? 0) + (v as number);
}

function project(doc: Doc, projection?: Record<string, 1>): Doc {
  if (!projection) return doc;
  const out: Doc = { _id: doc._id };
  for (const key of Object.keys(projection)) {
    if (key !== "_id") out[key] = getPath(doc, key);
  }
  return out;
}

/** A single fake collection. Records the last update for assertions. */
export class FakeCollection {
  docs: Doc[] = [];
  lastUpdate: Doc | null = null;

  createIndex(): Promise<string> {
    return Promise.resolve("idx");
  }

  insertOne(doc: Doc): Promise<{ insertedId: ObjectId }> {
    this.docs.push(doc);
    return Promise.resolve({ insertedId: doc._id });
  }

  findOne(query: Query): Promise<Doc | null> {
    return Promise.resolve(this.docs.find((d) => matchesQuery(d, query)) ?? null);
  }

  find(query: Query, options: Doc = {}): { toArray(): Promise<Doc[]> } {
    let result = this.docs.filter((d) => matchesQuery(d, query));
    if (options.sort) {
      const [[key, dir]] = Object.entries(options.sort) as [[string, number]];
      result = [...result].sort((a, b) => {
        const av = getPath(a, key) as number;
        const bv = getPath(b, key) as number;
        return av === bv ? 0 : (av < bv ? -1 : 1) * (dir as number);
      });
    }
    if (options.skip) result = result.slice(options.skip);
    if (options.limit !== undefined) result = result.slice(0, options.limit);
    if (options.projection) result = result.map((d) => project(d, options.projection));
    return { toArray: () => Promise.resolve(result) };
  }

  countDocuments(query: Query): Promise<number> {
    return Promise.resolve(this.docs.filter((d) => matchesQuery(d, query)).length);
  }

  findOneAndUpdate(filter: Query, update: Doc, options: Doc = {}): Promise<Doc | null> {
    const doc = this.docs.find((d) => matchesQuery(d, filter));
    if (!doc) return Promise.resolve(null);
    this.lastUpdate = update;
    if (update.$set) applySet(doc, update.$set);
    if (update.$inc) applyInc(doc, update.$inc);
    return Promise.resolve(options.returnDocument === "after" ? doc : doc);
  }

  findOneAndDelete(filter: Query): Promise<Doc | null> {
    const i = this.docs.findIndex((d) => matchesQuery(d, filter));
    if (i < 0) return Promise.resolve(null);
    const [doc] = this.docs.splice(i, 1);
    return Promise.resolve(doc);
  }
}

/** A fake `Db` exposing one collection per name and a no-op session client. */
export class FakeDb {
  collections = new Map<string, FakeCollection>();

  collection<T = Doc>(name: string): FakeCollection {
    let c = this.collections.get(name);
    if (!c) {
      c = new FakeCollection();
      this.collections.set(name, c);
    }
    return c;
  }

  get client(): {
    startSession(): {
      withTransaction(cb: () => Promise<unknown>): Promise<void>;
      endSession(): Promise<void>;
    };
  } {
    return {
      startSession() {
        return {
          async withTransaction(cb: () => Promise<unknown>): Promise<void> {
            await cb();
          },
          endSession(): Promise<void> {
            return Promise.resolve();
          },
        };
      },
    };
  }
}

/** Build a `FakeDb` typed as a mongodb `Db` for the MongoService constructor. */
export function fakeDb(): Db {
  return new FakeDb() as unknown as Db;
}
