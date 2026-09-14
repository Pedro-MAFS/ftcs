import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPersonIdAllocator, generatePersonId } from "./person-id.js";

function createTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "ftcs-person-id-"));
  mkdirSync(join(dir, "data", "leads", "prod_x"), { recursive: true });
  return dir;
}

test("createPersonIdAllocator assigns unique ids in one batch", () => {
  const root = createTempRoot();
  const date = new Date("2026-09-14T12:00:00Z");
  try {
    const next = createPersonIdAllocator(root, date);
    assert.equal(next(), "person_20260914_0001");
    assert.equal(next(), "person_20260914_0002");
    assert.equal(next(), "person_20260914_0003");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allocator continues after nested people ids in scored.json", () => {
  const root = createTempRoot();
  const date = new Date("2026-09-14T12:00:00Z");
  try {
    writeFileSync(
      join(root, "data", "leads", "prod_x", "scored.json"),
      JSON.stringify({
        product_id: "prod_x",
        leads: [
          {
            id: "lead_20260914_0001",
            people: [
              { id: "person_20260914_0001", email: "a@x.com" },
              { id: "person_20260914_0003", email: "b@x.com" },
            ],
          },
        ],
      }),
      "utf8"
    );

    const next = createPersonIdAllocator(root, date);
    assert.equal(next(), "person_20260914_0004");
    assert.equal(next(), "person_20260914_0005");
    assert.equal(generatePersonId(root, date), "person_20260914_0004");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
