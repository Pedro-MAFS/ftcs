import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readDomainSearchCache, writeDomainSearchCache } from "./cache.js";
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

  it("参数不同（limit/type/department）缓存键不同", () => {
    const base = { domain: "params.com", limit: 10 };
    writeDomainSearchCache(root, base, PAYLOAD);
    assert.equal(readDomainSearchCache(root, { domain: "params.com", limit: 20 }), null);
    assert.equal(readDomainSearchCache(root, { domain: "params.com", limit: 10, type: "personal" }), null);
    assert.ok(readDomainSearchCache(root, base));
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
