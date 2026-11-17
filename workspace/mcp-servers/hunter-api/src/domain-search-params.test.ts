import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { domainSearchToolSchema } from "./domain-search-params.js";
import { buildOfficialDomainSearchBody } from "./gateway.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("domain_search tool input", () => {
  it("未传的可选字段保持缺省，不代填 limit，也不默认 personal", () => {
    const parsed = domainSearchToolSchema.parse({ domain: "acme.com" });
    assert.equal(parsed.limit, undefined);
    assert.equal(parsed.type, undefined);
    assert.equal(parsed.department, undefined);
    assert.equal(parsed.seniority, undefined);
    assert.equal(parsed.offset, undefined);
    const body = buildOfficialDomainSearchBody({
      domain: parsed.domain.toLowerCase(),
    });
    assert.deepEqual(body, { domain: "acme.com" });
    assert.equal(JSON.stringify(body).includes("null"), false);
  });

  it("limit 为 0、101、非整数或字符串时拒绝，不会变成 10", () => {
    for (const limit of [0, 101, 1.5, -1, Number.NaN, "10", "100"]) {
      const parsed = domainSearchToolSchema.safeParse({ domain: "acme.com", limit });
      assert.equal(parsed.success, false, `limit ${String(limit)} should be rejected`);
    }
    assert.equal(buildOfficialDomainSearchBody({ domain: "acme.com" }).limit, undefined);
  });

  it("type 只允许 personal 或 generic，department 与 seniority 必须非空", () => {
    assert.equal(domainSearchToolSchema.safeParse({ domain: "acme.com", type: "work" }).success, false);
    assert.equal(domainSearchToolSchema.safeParse({ domain: "acme.com", type: "personal" }).success, true);
    assert.equal(domainSearchToolSchema.safeParse({ domain: "acme.com", type: "generic" }).success, true);
    assert.equal(domainSearchToolSchema.safeParse({ domain: "acme.com", department: "" }).success, false);
    assert.equal(domainSearchToolSchema.safeParse({ domain: "acme.com", seniority: " " }).success, false);
    assert.equal(domainSearchToolSchema.safeParse({ domain: "acme.com", offset: -1 }).success, false);
    assert.equal(domainSearchToolSchema.safeParse({ domain: "acme.com", offset: 1.5 }).success, false);
    const parsed = domainSearchToolSchema.parse({
      domain: "acme.com",
      limit: 25,
      type: "generic",
      department: " sales,it ",
      seniority: "senior",
      offset: 0,
      job_titles: "ceo",
    });
    assert.equal("job_titles" in parsed, false);
    assert.equal(parsed.department, "sales,it");
    assert.equal(parsed.offset, 0);
    const body = buildOfficialDomainSearchBody(parsed);
    assert.deepEqual(body, {
      domain: "acme.com",
      limit: 25,
      type: "generic",
      department: "sales,it",
      seniority: "senior",
      offset: 0,
    });
    assert.equal("job_titles" in body, false);
    assert.equal("api_key" in body, false);
  });

  it("工具描述不再写死 limit，验邮工具不循环 people", () => {
    const index = readFileSync(join(here, "../src/index.ts"), "utf8");
    assert.equal(index.includes(".default(10)"), false);
    assert.equal(index.includes("free plan"), false);
    assert.equal(index.includes("once per email"), false);
    assert.equal(index.includes("job_titles"), false);
    assert.match(index, /domainSearchToolShape/);
    assert.match(index, /offset !== undefined \? \{ offset \}/);
    assert.match(index, /Call only when the verify toggle allows it and this address was selected/);
    assert.match(index, /The tool does not loop people\[\]/);
    assert.match(index, /Do not retry the same address after a failure/);
  });
});
