import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyInputFile,
  getFileExtension,
} from "./file-types.js";
import {
  buildFollowUpQuestions,
  computeReadiness,
  resolveStatus,
} from "./readiness.js";

test("getFileExtension returns lowercase extension", () => {
  assert.equal(getFileExtension("catalog.PDF"), ".pdf");
  assert.equal(getFileExtension("notes"), "");
});

test("classifyInputFile handles supported and special files", () => {
  assert.equal(classifyInputFile("product.txt"), "supported");
  assert.equal(classifyInputFile("catalog.pdf"), "special");
  assert.equal(classifyInputFile("image.bin"), "unknown");
});

test("computeReadiness scores complete profile as ready", () => {
  const readiness = computeReadiness({
    company: { name: "ACME", website: "https://acme.com" },
    products: [{ name: "Ball Valve", use_cases: ["water treatment"] }],
    buyer_personas: [{ role: "procurement_manager" }],
    target_markets: { regions: ["EU"] },
    competitors: [{ name: "Competitor A" }],
  });

  assert.equal(readiness.score, 100);
  assert.deepEqual(readiness.missing_fields, []);
  assert.equal(resolveStatus(readiness), "ready");
});

test("computeReadiness marks incomplete profile as draft", () => {
  const readiness = computeReadiness({
    company: { name: "ACME" },
    products: [],
    buyer_personas: [],
    target_markets: {},
    competitors: [],
  });

  assert.ok(readiness.score < 60);
  assert.equal(resolveStatus(readiness), "draft");
  assert.ok(buildFollowUpQuestions(readiness.missing_fields).length > 0);
});
