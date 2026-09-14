import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { HunterClient, HunterError } from "./client.js";
import {
  ACCOUNT_RESPONSE,
  PANTRON_DOMAIN_SEARCH_RESPONSE,
  VERIFIER_VALID_RESPONSE,
} from "./fixtures.js";

const K1 = "aaaa1111";
const K2 = "bbbb2222";
const K3 = "cccc3333";

type FetchCall = { url: string; key: string | undefined };

function makeFetch(
  handler: (call: FetchCall, index: number) => { status: number; body: unknown }
): { fetchImpl: (url: string, init?: { headers?: Record<string, string> }) => Promise<{ status: number; json: () => Promise<unknown> }>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string, init?: { headers?: Record<string, string> }) => {
    const call: FetchCall = { url, key: init?.headers?.["X-API-Key"] };
    calls.push(call);
    const { status, body } = handler(call, calls.length);
    return { status, json: async () => body };
  };
  return { fetchImpl, calls };
}

const okAccount = { status: 200, body: ACCOUNT_RESPONSE };
const okDomainSearch = { status: 200, body: PANTRON_DOMAIN_SEARCH_RESPONSE };

describe("hunter-api client", () => {
  // 每个用例使用独立 root，避免 Key 池状态在用例间污染
  const roots: string[] = [];
  function freshRoot(): string {
    const dir = mkdtempSync(join(tmpdir(), "ftcs-hunter-client-"));
    roots.push(dir);
    return dir;
  }
  after(() => {
    for (const dir of roots) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("无 Key 时返回 HUNTER_NO_KEY 且不发请求", async () => {
    const { fetchImpl, calls } = makeFetch(() => okDomainSearch);
    const client = new HunterClient({ keys: [], root: freshRoot(), fetchImpl });
    await assert.rejects(
      () => client.domainSearch({ domain: "pantron.com" }),
      (error: unknown) => error instanceof HunterError && error.code === "HUNTER_NO_KEY"
    );
    assert.equal(calls.length, 0);
    await assert.rejects(
      () => client.verifyEmail("a@b.com"),
      (error: unknown) => error instanceof HunterError && error.code === "HUNTER_NO_KEY"
    );
    await assert.rejects(
      () => client.accountInfo(),
      (error: unknown) => error instanceof HunterError && error.code === "HUNTER_NO_KEY"
    );
  });

  it("单 Key 401 → HUNTER_UNAUTHORIZED", async () => {
    const { fetchImpl } = makeFetch(() => ({
      status: 401,
      body: { errors: [{ id: "authentication_failed", code: 401, details: "No user found for the API key supplied." }] },
    }));
    const client = new HunterClient({ keys: [K1], root: freshRoot(), fetchImpl });
    await assert.rejects(
      () => client.domainSearch({ domain: "pantron.com" }),
      (error: unknown) =>
        error instanceof HunterError && error.code === "HUNTER_UNAUTHORIZED" && error.message.includes("…1111")
    );
  });

  it("单 Key 429 → HUNTER_QUOTA_EXCEEDED，并学习 reset_date；后续直接报额度错误不再发请求", async () => {
    const { fetchImpl, calls } = makeFetch((call) => {
      if (call.url.includes("/account")) return okAccount;
      return { status: 429, body: { errors: [{ id: "rate_limit_hit", code: 429, details: "Too many calls" }] } };
    });
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-429-"));
    try {
      const client = new HunterClient({ keys: [K1], root: isolatedRoot, fetchImpl });
      await assert.rejects(
        () => client.domainSearch({ domain: "pantron.com" }),
        (error: unknown) =>
          error instanceof HunterError &&
          error.code === "HUNTER_QUOTA_EXCEEDED" &&
          error.message.includes("2026-10-14")
      );
      const callsAfterFirst = calls.length;
      await assert.rejects(
        () => client.domainSearch({ domain: "other.com" }),
        (error: unknown) => error instanceof HunterError && error.code === "HUNTER_QUOTA_EXCEEDED"
      );
      assert.equal(calls.length, callsAfterFirst);
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("多 Key failover：k1 429 → 自动切 k2 成功；后续请求跳过 k1", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-failover-"));
    try {
      const { fetchImpl, calls } = makeFetch((call) => {
        if (call.url.includes("/account")) return okAccount;
        if (call.key === K1) return { status: 429, body: {} };
        return okDomainSearch;
      });
      const client = new HunterClient({ keys: [K1, K2], root: isolatedRoot, fetchImpl });

      const first = await client.domainSearch({ domain: "alpha.com" });
      assert.equal(first.cached, false);
      assert.equal(first.domain, "pantron.com");

      const second = await client.domainSearch({ domain: "beta.com" });
      assert.equal(second.cached, false);

      const searchCalls = calls.filter((c) => c.url.includes("/domain-search"));
      assert.equal(searchCalls[0]?.key, K1);
      assert.equal(searchCalls[1]?.key, K2);
      assert.equal(searchCalls[2]?.key, K2);
      assert.equal(searchCalls.length, 3);
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("k1 401 标记 invalid 后切 k2", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-401-"));
    try {
      const { fetchImpl, calls } = makeFetch((call) => {
        if (call.key === K1) return { status: 401, body: { errors: [{ id: "authentication_failed", code: 401, details: "bad key" }] } };
        return okDomainSearch;
      });
      const client = new HunterClient({ keys: [K1, K2], root: isolatedRoot, fetchImpl });
      const result = await client.domainSearch({ domain: "gamma.com" });
      assert.equal(result.domain, "pantron.com");
      assert.deepEqual(calls.map((c) => c.key), [K1, K2]);
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("全部 Key 429 → HUNTER_ALL_KEYS_EXHAUSTED，信息含各 Key 指纹尾号", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-all429-"));
    try {
      const { fetchImpl } = makeFetch((call) => {
        if (call.url.includes("/account")) return okAccount;
        return { status: 429, body: {} };
      });
      const client = new HunterClient({ keys: [K1, K2], root: isolatedRoot, fetchImpl });
      await assert.rejects(
        () => client.domainSearch({ domain: "delta.com" }),
        (error: unknown) =>
          error instanceof HunterError &&
          error.code === "HUNTER_ALL_KEYS_EXHAUSTED" &&
          error.message.includes("…1111") &&
          error.message.includes("…2222")
      );
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("5xx → HUNTER_UPSTREAM_ERROR 且不标记 Key，下次仍用同一 Key", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-5xx-"));
    try {
      let n = 0;
      const { fetchImpl, calls } = makeFetch(() => {
        n += 1;
        return n === 1
          ? { status: 500, body: {} }
          : okDomainSearch;
      });
      const client = new HunterClient({ keys: [K1], root: isolatedRoot, fetchImpl });
      await assert.rejects(
        () => client.domainSearch({ domain: "epsilon.com" }),
        (error: unknown) => error instanceof HunterError && error.code === "HUNTER_UPSTREAM_ERROR"
      );
      const ok = await client.domainSearch({ domain: "epsilon.com" });
      assert.equal(ok.cached, false);
      assert.ok(calls.every((c) => c.key === K1));
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("451 claimed_email → HUNTER_CLAIMED_EMAIL，不发生 failover", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-451-"));
    try {
      const { fetchImpl, calls } = makeFetch(() => ({
        status: 451,
        body: { errors: [{ id: "claimed_email", code: 451, details: "The owner has claimed this email address." }] },
      }));
      const client = new HunterClient({ keys: [K1, K2], root: isolatedRoot, fetchImpl });
      await assert.rejects(
        () => client.verifyEmail("claimed@example.com"),
        (error: unknown) => error instanceof HunterError && error.code === "HUNTER_CLAIMED_EMAIL"
      );
      assert.equal(calls.length, 1);
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("400 pagination_error → HUNTER_PAGINATION_ERROR", async () => {
    const { fetchImpl } = makeFetch(() => ({
      status: 400,
      body: { errors: [{ id: "pagination_error", code: 400, details: "Your plan does not allow you to request more than 10 rows." }] },
    }));
    const client = new HunterClient({ keys: [K1], root: freshRoot(), fetchImpl });
    await assert.rejects(
      () => client.domainSearch({ domain: "zeta.com", limit: 100 }),
      (error: unknown) =>
        error instanceof HunterError &&
        error.code === "HUNTER_PAGINATION_ERROR" &&
        error.message.includes("limit+offset")
    );
  });

  it("domain_search 响应裁剪：sources ≤5 且 still_on_page 优先、无 sources 丢弃计数", async () => {
    const { fetchImpl } = makeFetch(() => okDomainSearch);
    const client = new HunterClient({ keys: [K1], root: freshRoot(), fetchImpl });
    const result = await client.domainSearch({ domain: "trimme.com" });
    assert.equal(result.cached, false);
    assert.equal(result.dropped_no_sources, 1);
    assert.equal(result.emails.length, 3);

    const sales = result.emails.find((e) => e.value === "sales@pantron.com");
    assert.ok(sales);
    assert.equal(sales.source_count, 17);
    assert.equal(sales.sources.length, 5);
    assert.equal(sales.sources.filter((s) => s.still_on_page).length, 2);
    assert.ok(sales.sources[0]?.still_on_page);
    assert.ok(sales.sources[1]?.still_on_page);
    assert.equal(result.meta.results, 7);
  });

  it("domain_search 缓存：同参二次命中不重复调用；多 Key 共享缓存", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-cache-"));
    try {
      const { fetchImpl, calls } = makeFetch(() => okDomainSearch);
      const client = new HunterClient({ keys: [K1, K2], root: isolatedRoot, fetchImpl });

      const first = await client.domainSearch({ domain: "cache.me" });
      assert.equal(first.cached, false);
      assert.equal(calls.length, 1);

      const second = await client.domainSearch({ domain: "cache.me" });
      assert.equal(second.cached, true);
      assert.equal(calls.length, 1);

      const differentLimit = await client.domainSearch({ domain: "cache.me", limit: 20 });
      assert.equal(differentLimit.cached, false);
      assert.equal(calls.length, 2);
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("verifier 202 轮询：同一 Key 重复请求直至 200", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-poll-"));
    try {
      let n = 0;
      const { fetchImpl, calls } = makeFetch(() => {
        n += 1;
        return n < 3 ? { status: 202, body: { data: {} } } : { status: 200, body: VERIFIER_VALID_RESPONSE };
      });
      const client = new HunterClient({
        keys: [K1, K2],
        root: isolatedRoot,
        fetchImpl,
        sleep: async () => {},
      });
      const result = await client.verifyEmail("steve@pantron.com");
      assert.equal(result.pending, false);
      assert.equal(result.status, "valid");
      assert.equal(calls.length, 3);
      assert.ok(calls.every((c) => c.key === K1));
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("verifier 202 超预算返回 pending: true（不报错）", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-pending-"));
    try {
      let t = Date.parse("2026-09-14T09:00:00.000Z");
      const { fetchImpl, calls } = makeFetch(() => ({ status: 202, body: { data: {} } }));
      const client = new HunterClient({
        keys: [K1],
        root: isolatedRoot,
        fetchImpl,
        sleep: async (ms) => {
          t += ms;
        },
        now: () => new Date(t),
      });
      const result = await client.verifyEmail("slow@example.com");
      assert.equal(result.pending, true);
      assert.equal(result.status, "unknown");
      assert.ok(calls.length >= 12);
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("verifier 单 Key 429 → HUNTER_QUOTA_EXCEEDED", async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), "ftcs-hunter-v429-"));
    try {
      const { fetchImpl } = makeFetch((call) => {
        if (call.url.includes("/account")) return okAccount;
        return { status: 429, body: {} };
      });
      const client = new HunterClient({ keys: [K1], root: isolatedRoot, fetchImpl });
      await assert.rejects(
        () => client.verifyEmail("quota@example.com"),
        (error: unknown) => error instanceof HunterError && error.code === "HUNTER_QUOTA_EXCEEDED"
      );
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("account_info 单 Key 透传结构；多 Key 返回 keys[] 汇总", async () => {
    const { fetchImpl } = makeFetch(() => okAccount);
    const single = new HunterClient({ keys: [K1], root: freshRoot(), fetchImpl });
    const singleInfo = (await single.accountInfo()) as { requests?: { credits?: { remaining: number } }; key_tail: string };
    assert.equal(singleInfo.requests?.credits?.remaining, 45);
    assert.equal(singleInfo.key_tail, "1111");

    const multi = new HunterClient({ keys: [K1, K2, K3], root: freshRoot(), fetchImpl });
    const multiInfo = (await multi.accountInfo()) as { keys: Array<{ tail: string }>; total_remaining: number };
    assert.equal(multiInfo.keys.length, 3);
    assert.deepEqual(multiInfo.keys.map((k) => k.tail), ["1111", "2222", "3333"]);
    assert.equal(multiInfo.total_remaining, 135);
  });

  it("account_info 中失效 Key 标记为 invalid，不抛错", async () => {
    const { fetchImpl } = makeFetch((call) =>
      call.key === K2
        ? { status: 401, body: { errors: [{ id: "authentication_failed", code: 401, details: "bad" }] } }
        : okAccount
    );
    const client = new HunterClient({ keys: [K1, K2], root: freshRoot(), fetchImpl });
    const info = (await client.accountInfo()) as { keys: Array<{ tail: string; status: string }>; total_remaining: number };
    assert.equal(info.keys[0]?.status, "ok");
    assert.equal(info.keys[1]?.status, "invalid");
    assert.equal(info.total_remaining, 45);
  });
});
