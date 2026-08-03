import { PGlite } from "@electric-sql/pglite";
import { expect } from "@std/expect";
import { conformanceSchema } from "@hushkey/service-core/conformance";
import { type PgClientLike, PgService } from "../mod.ts";

// PGlite is real Postgres (WASM) — the collation-folded ORDER BY and the
// promoted-column path compile exactly as they would on a server.
const pglite: PGlite = await PGlite.create();
let n = 0;

function makeService(promoteName = false) {
  return new PgService(pglite as unknown as PgClientLike, conformanceSchema, {
    collectionName: `findopts_${++n}`,
    promote: promoteName ? [{ path: "name", type: "text" }] : [],
  });
}

Deno.test("[find-options] pg advertises project/collation as approximate, hint as none", () => {
  expect(makeService().findCapabilities).toEqual({
    project: "approximate",
    sort: "native",
    collation: "approximate",
    hint: "none",
  });
});

Deno.test("[find-options] a collation folds case on a promoted column too", async () => {
  const svc = makeService(true);
  await svc.create({ name: "cherry", email: "c@x.com" });
  await svc.create({ name: "Banana", email: "b@x.com" });
  await svc.create({ name: "apple", email: "a@x.com" });

  const folded = await svc.find({
    sort: { name: 1 },
    collation: { locale: "en", strength: 1 },
  });
  expect(folded.map((d) => d.name)).toEqual(["apple", "Banana", "cherry"]);
});

Deno.test("[find-options] hints are accepted and ignored (Postgres has none)", async () => {
  const svc = makeService();
  await svc.create({ name: "a", email: "a@x.com" });
  await svc.create({ name: "b", email: "b@x.com" });

  const hinted = await svc.find({ sort: { name: 1 }, hint: "any_index_name" });
  expect(hinted.map((d) => d.name)).toEqual(["a", "b"]);
});

Deno.test("[find-options] teardown", async () => {
  await pglite.close();
});
