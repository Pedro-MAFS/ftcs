import test from "node:test";
import assert from "node:assert/strict";
import {
  KeywordExpansionWriteSchema,
  SearchQueryWriteSchema,
} from "./keyword-types.js";

const r2Query = {
  id: "q_001",
  query: "WPC decking distributor Germany",
  dimension: "buyer" as const,
  language: "en",
  priority: "high" as const,
  round: "R2" as const,
};

function expansionWithQueries(
  search_queries: Array<Record<string, unknown>>,
) {
  return {
    product_id: "prod_test",
    generated_at: "2026-08-23T00:00:00.000Z",
    dimensions: {
      product: ["WPC"],
      scenario: [],
      buyer: ["distributor"],
      geo: [],
      competitor: [],
    },
    search_queries,
    stats: { total_queries: search_queries.length, by_round: { R2: search_queries.length } },
  };
}

test("SearchQueryWriteSchema requires site_id on R2", () => {
  const result = SearchQueryWriteSchema.safeParse(r2Query);
  assert.equal(result.success, false);
});

test("SearchQueryWriteSchema accepts R2 with site_id", () => {
  const result = SearchQueryWriteSchema.safeParse({
    ...r2Query,
    site_id: "linkedin_company",
  });
  assert.equal(result.success, true);
});

test("SearchQueryWriteSchema rejects site: in R2 query", () => {
  const result = SearchQueryWriteSchema.safeParse({
    ...r2Query,
    query: "site:linkedin.com WPC decking",
    site_id: "linkedin_company",
  });
  assert.equal(result.success, false);
});

test("SearchQueryWriteSchema rejects site_id on R1", () => {
  const result = SearchQueryWriteSchema.safeParse({
    ...r2Query,
    round: "R1",
    site_id: "linkedin_company",
  });
  assert.equal(result.success, false);
});

const r3Query = {
  id: "q_041",
  query: "Bodenbelag Fachhandel München",
  dimension: "geo" as const,
  language: "de",
  priority: "high" as const,
  round: "R3" as const,
};

test("SearchQueryWriteSchema accepts R3 without site_id", () => {
  const result = SearchQueryWriteSchema.safeParse(r3Query);
  assert.equal(result.success, true);
});

test("SearchQueryWriteSchema rejects site: in R3 query", () => {
  const result = SearchQueryWriteSchema.safeParse({
    ...r3Query,
    query: "site:maps.google.com flooring Munich",
  });
  assert.equal(result.success, false);
});

test("SearchQueryWriteSchema rejects site_id on R3", () => {
  const result = SearchQueryWriteSchema.safeParse({
    ...r3Query,
    site_id: "linkedin_company",
  });
  assert.equal(result.success, false);
});

test("KeywordExpansionWriteSchema rejects R2 without site_id", () => {
  const result = KeywordExpansionWriteSchema.safeParse(
    expansionWithQueries([r2Query]),
  );
  assert.equal(result.success, false);
});

test("KeywordExpansionWriteSchema keeps R2 site_id", () => {
  const parsed = KeywordExpansionWriteSchema.parse(
    expansionWithQueries([{ ...r2Query, site_id: "linkedin_company" }]),
  );
  assert.equal(parsed.search_queries[0].site_id, "linkedin_company");
});
