import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { domainSearchCacheRaw, readDomainSearchCache, writeDomainSearchCache } from "./cache.js";
import { getHunterCacheDir } from "./paths.js";
import type { TrimmedDomainSearch } from "./types.js";

const PAYLOAD: TrimmedDomainSearch = {
  domain: "example.com",
  organization: "Example Inc",
  pattern: "{first}",
  accept_all: false,
  disposable: false,
  webmail: false,
  emails: [],
  dropped_no_sources: 0,
  meta: { results: 3 },
};

describe("domain_search cache", () => {
  let root: string;
  before(() => {
    root = mkdtempSync(join(tmpdir(), "ftcs-hunter-cache-test-"));
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("写入后 24h 内可命中", () => {
    const key = { domain: "example.com", limit: 10 };
    assert.equal(readDomainSearchCache(root, key), null);
    writeDomainSearchCache(root, key, PAYLOAD);
    const hit = readDomainSearchCache(root, key);
    assert.ok(hit);
    assert.equal(hit.domain, "example.com");
    assert.equal(hit.meta.results, 3);
  });

  it("超过 24h 过期", () => {
    const key = { domain: "ttl.com", limit: 10 };
    writeDomainSearchCache(root, key, PAYLOAD);
    const now = Date.now();
    assert.ok(readDomainSearchCache(root, key, now));
    assert.equal(readDomainSearchCache(root, key, now + 25 * 3600 * 1000), null);
  });

  it("参数不同（limit/type/department/offset）缓存键不同", () => {
    const base = { domain: "params.com", limit: 10 };
    writeDomainSearchCache(root, base, PAYLOAD);
    assert.equal(readDomainSearchCache(root, { domain: "params.com", limit: 20 }), null);
    assert.equal(readDomainSearchCache(root, { domain: "params.com", limit: 10, type: "personal" }), null);
    assert.equal(readDomainSearchCache(root, { domain: "params.com", limit: 10, offset: 10 }), null);
    assert.ok(readDomainSearchCache(root, base));
  });

  it("六段键区分缺省 limit、offset 0 与下一页，且不含 Key 或通道", () => {
    assert.equal(domainSearchCacheRaw({ domain: "Ex.COM" }), "ex.com|||||0");
    assert.equal(domainSearchCacheRaw({ domain: "ex.com", offset: 0 }), "ex.com|||||0");
    assert.equal(domainSearchCacheRaw({ domain: "ex.com", limit: 10 }), "ex.com|10||||0");
    assert.equal(domainSearchCacheRaw({ domain: "ex.com", limit: 10, offset: 10 }), "ex.com|10||||10");
    assert.equal(
      domainSearchCacheRaw({
        domain: "ex.com",
        limit: 40,
        type: "generic",
        department: "sales,it",
        seniority: "senior",
        offset: 20,
      }),
      "ex.com|40|generic|sales,it|senior|20"
    );
    const raw = domainSearchCacheRaw({ domain: "ex.com", limit: 10, offset: 10 });
    assert.equal(raw.includes("hunter-key"), false);
    assert.equal(raw.includes("official"), false);
    assert.equal(raw.includes("custom"), false);

    writeDomainSearchCache(root, { domain: "pages.example" }, PAYLOAD);
    assert.ok(readDomainSearchCache(root, { domain: "pages.example", offset: 0 }));
    assert.equal(readDomainSearchCache(root, { domain: "pages.example", limit: 10 }), null);
    assert.equal(readDomainSearchCache(root, { domain: "pages.example", offset: 10 }), null);
  });

  it("未命中时不读取旧的五段键", () => {
    const domain = "legacy.example";
    const oldRaw = `${domain}|10|||`;
    const oldHash = createHash("sha256").update(oldRaw).digest("hex").slice(0, 16);
    const dir = join(getHunterCacheDir(root), "domain-search");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${oldHash}.json`),
      `${JSON.stringify({
        cached_at: new Date().toISOString(),
        payload: { ...PAYLOAD, organization: "old-five" },
      })}\n`,
      "utf8"
    );
    assert.notEqual(domainSearchCacheRaw({ domain, limit: 10 }), oldRaw);
    assert.equal(readDomainSearchCache(root, { domain, limit: 10 }), null);
    assert.equal(readDomainSearchCache(root, { domain, limit: 10, offset: 0 }), null);
  });

  it("缓存键与 API Key 无关（多 Key 共享）", () => {
    // 缓存键构造只含 domain+参数，天然与 Key 无关 —— 以文件数量佐证不会因 Key 变化产生新文件
    const dir = join(root, "data", "cache", "hunter", "domain-search");
    const before_ = exists(dir) ? readdirSync(dir).length : 0;
    writeDomainSearchCache(root, { domain: "shared.com", limit: 10 }, PAYLOAD);
    writeDomainSearchCache(root, { domain: "shared.com", limit: 10 }, PAYLOAD);
    const after_ = readdirSync(dir).length;
    assert.equal(after_, before_ + 1);

    function exists(p: string): boolean {
      try {
        readdirSync(p);
        return true;
      } catch {
        return false;
      }
    }
  });

  it("缓存文件损坏时静默返回 null", () => {
    const isolated = mkdtempSync(join(tmpdir(), "ftcs-hunter-cache-corrupt-"));
    try {
      const key = { domain: "corrupt.com", limit: 10 };
      writeDomainSearchCache(isolated, key, PAYLOAD);
      assert.ok(readDomainSearchCache(isolated, key));
      const dir = join(isolated, "data", "cache", "hunter", "domain-search");
      for (const file of readdirSync(dir)) {
        writeFileSync(join(dir, file), "not json", "utf8");
      }
      assert.equal(readDomainSearchCache(isolated, key), null);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });
});
