import { expect } from "@std/expect";
import { uuidv7 } from "../ids/uuid.ts";

Deno.test("uuidv7 emits canonical form with version 7 and RFC variant", () => {
  for (let i = 0; i < 50; i++) {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

Deno.test("uuidv7 leads with the current timestamp", () => {
  const before = Date.now();
  const id = uuidv7();
  const after = Date.now();
  const ts = parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
  expect(ts).toBeGreaterThanOrEqual(before);
  expect(ts).toBeLessThanOrEqual(after);
});

Deno.test("uuidv7 ids sort chronologically across milliseconds", async () => {
  const first = uuidv7();
  await new Promise((r) => setTimeout(r, 5));
  const second = uuidv7();
  expect(first < second).toBe(true);
});
