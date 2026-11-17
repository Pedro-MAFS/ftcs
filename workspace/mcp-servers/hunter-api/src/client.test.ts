import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { HunterClient, HunterError } from "./client.js";
import {
  OFFICIAL_BALANCE_MESSAGE,
  OFFICIAL_GENERIC_MESSAGE,
  OFFICIAL_PAGINATION_MESSAGE,
  OFFICIAL_UNAVAILABLE_MESSAGE,
  OFFICIAL_VERIFY_FAILED_MESSAGE,
  OFFICIAL_VERIFY_PENDING_MESSAGE,
  OFFICIAL_VERIFIER_TIMEOUT_MS,
  OFFICIAL_ACCOUNT_MESSAGE,
  OFFICIAL_CREDENTIAL_MESSAGE,
} from "./gateway.js";
import {
  ACCOUNT_RESPONSE,
  PANTRON_DOMAIN_SEARCH_RESPONSE,
  VERIFIER_VALID_RESPONSE,
} from "./fixtures.js";

const K1 = "aaaa1111";
const K2 = "bbbb2222";
const K3 = "cccc3333";

type FetchCall = {
  url: string;
  key: string | undefined;
  method?: string;
  authorization?: string;
  body?: string;
  headers?: Record<string, string>;
};

function makeFetch(
  handler: (call: FetchCall, index: number) => { status: number; body: unknown }
): {
  fetchImpl: (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ) => Promise<{ status: number; json: () => Promise<unknown> }>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = async (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ) => {
    const headers = init?.headers ?? {};
    const call: FetchCall = {
      url,
      key: headers["X-API-Key"],
      method: init?.method,
      authorization: headers.Authorization,
      body: init?.body,
      headers,
    };
    calls.push(call);
    const { status, body } = handler(call, calls.length);
    return { status, json: async () => body };
  };
  return { fetchImpl, calls };
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const okAccount = { status: 200, body: ACCOUNT_RESPONSE };
const okDomainSearch = { status: 200, body: PANTRON_DOMAIN_SEARCH_RESPONSE };

describe("hunter-api client", () => {
  const savedEnv = {
    FTCS_CHANNEL_MODE: process.env.FTCS_CHANNEL_MODE,
    FTCS_GATEWAY_API_KEY: process.env.FTCS_GATEWAY_API_KEY,
    FTCS_TOKEN_GATEWAY_BASE_URL: process.env.FTCS_TOKEN_GATEWAY_BASE_URL,
  };
  before(() => {
    delete process.env.FTCS_CHANNEL_MODE;
    delete process.env.FTCS_GATEWAY_API_KEY;
    delete process.env.FTCS_TOKEN_GATEWAY_BASE_URL;
  });

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
    restoreEnv(savedEnv);
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
          error.message.includes("2099-01-01")
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

  const USER_HUNTER_KEY = "user-hunter-key-should-not-leak";
  const OFFICIAL_SK = "sk-official-gateway";

  function emptyPage(domain = "empty.example") {
    return {
      data: {
        domain,
        organization: null,
        pattern: null,
        accept_all: null,
        disposable: null,
        webmail: null,
        emails: [] as unknown[],
      },
      meta: { results: 0, results_approximate: false },
    };
  }

  function officialClient(
    fetchImpl: ReturnType<typeof makeFetch>["fetchImpl"],
    root: string,
    options?: { channelMode?: "official" | "custom"; gatewayApiKey?: string; gatewayBaseUrl?: string }
  ) {
    return new HunterClient({
      keys: [USER_HUNTER_KEY],
      root,
      fetchImpl,
      channelMode: options?.channelMode ?? "official",
      gatewayApiKey: options && "gatewayApiKey" in options ? options.gatewayApiKey : OFFICIAL_SK,
      gatewayBaseUrl: options?.gatewayBaseUrl ?? "https://gw.example/v1/",
    });
  }

  function assertOfficialPost(call: FetchCall, domain: string) {
    const url = new URL(call.url);
    assert.equal(url.origin + url.pathname, "https://gw.example/v1/hunter/domain-search");
    assert.equal(url.pathname.includes("/v1/v1/"), false);
    assert.equal(url.hostname, "gw.example");
    assert.notEqual(url.hostname, "api.hunter.io");
    assert.equal(call.method, "POST");
    assert.equal(call.authorization, `Bearer ${OFFICIAL_SK}`);
    assert.equal(call.key, undefined);
    assert.equal(call.headers?.["Content-Type"], "application/json");
    assert.equal(call.headers?.Accept, "application/json");
    assert.match(call.headers?.["X-Request-Id"] ?? "", /^[A-Za-z0-9._-]{1,64}$/);
    assert.equal((call.headers?.["X-Request-Id"] ?? "").includes(domain), false);
    assert.equal((call.headers?.["X-Request-Id"] ?? "").includes(OFFICIAL_SK), false);
    assert.equal((call.headers?.["X-Request-Id"] ?? "").includes(USER_HUNTER_KEY), false);
    const payload = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
    assert.equal(payload.domain, domain);
    assert.equal(payload.api_key, undefined);
    assert.equal(payload.offset, undefined);
    assert.equal(JSON.stringify(payload).includes(USER_HUNTER_KEY), false);
    assert.equal(JSON.stringify(call.headers).includes(USER_HUNTER_KEY), false);
    return payload;
  }

  it("官方无用户 Key 依赖：单次 POST 网关，凭证是 sk，不含 api_key", async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: PANTRON_DOMAIN_SEARCH_RESPONSE }));
    const client = officialClient(fetchImpl, freshRoot());
    const result = await client.domainSearch({ domain: "pantron.com", limit: 10 });
    assert.equal(calls.length, 1);
    const payload = assertOfficialPost(calls[0]!, "pantron.com");
    assert.equal(payload.limit, 10);
    assert.equal("type" in payload, false);
    assert.equal(result.cached, false);
    assert.equal(result.emails.length, 3);
    assert.equal(result.emails.some((email) => email.value === "steve@pantron.com"), true);
  });

  it("官方可选字段只在有值时出现，不传 null 或 offset", async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: emptyPage("filters.example") }));
    const client = officialClient(fetchImpl, freshRoot());
    await client.domainSearch({
      domain: "filters.example",
      limit: 10,
      type: "personal",
      department: "sales",
      seniority: "executive",
    });
    const payload = assertOfficialPost(calls[0]!, "filters.example");
    assert.deepEqual(payload, {
      domain: "filters.example",
      limit: 10,
      type: "personal",
      department: "sales",
      seniority: "executive",
    });
  });

  it("官方 200 且 emails 为空：成功空页，不编造联系人", async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: emptyPage() }));
    const client = officialClient(fetchImpl, freshRoot());
    const result = await client.domainSearch({ domain: "empty.example" });
    assert.equal(calls.length, 1);
    assert.equal(result.cached, false);
    assert.deepEqual(result.emails, []);
    assert.equal(result.meta.results, 0);
  });

  it("官方上游 emails 非空但无 sources：只请求一页，不自动 offset=10", async () => {
    const body = emptyPage("nosource.example");
    body.data.emails = [
      {
        value: "a@nosource.example",
        type: "personal",
        confidence: 90,
        first_name: null,
        last_name: null,
        position: null,
        seniority: null,
        department: null,
        decision_maker: null,
        verification: null,
        sources: [],
      },
    ];
    body.meta = { results: 25, results_approximate: false };
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body }));
    const client = officialClient(fetchImpl, freshRoot());
    const result = await client.domainSearch({ domain: "nosource.example", limit: 10 });
    assert.equal(calls.length, 1);
    assert.equal(result.emails.length, 0);
    assert.equal(result.dropped_no_sources, 1);
    assert.equal(result.meta.results, 25);
    assert.equal(JSON.parse(calls[0]!.body ?? "{}").offset, undefined);
  });

  it("官方 meta.results 缺失时用 emails.length", async () => {
    const body = emptyPage("meta.example");
    delete (body as { meta?: unknown }).meta;
    const { fetchImpl } = makeFetch(() => ({ status: 200, body }));
    const client = officialClient(fetchImpl, freshRoot());
    const result = await client.domainSearch({ domain: "meta.example" });
    assert.equal(result.meta.results, 0);
  });

  it("官方缓存命中零出站；自定义写入的缓存官方同样命中", async () => {
    const root = freshRoot();
    const customFetch = makeFetch(() => ({ status: 200, body: PANTRON_DOMAIN_SEARCH_RESPONSE }));
    const custom = new HunterClient({
      keys: [K1],
      root,
      fetchImpl: customFetch.fetchImpl,
      channelMode: "custom",
      gatewayApiKey: OFFICIAL_SK,
      gatewayBaseUrl: "https://gw.example/v1",
    });
    await custom.domainSearch({ domain: "shared.example" });
    assert.equal(customFetch.calls.length, 1);
    assert.equal(customFetch.calls[0]!.url.includes("api.hunter.io/v2/domain-search"), true);
    assert.equal(customFetch.calls[0]!.key, K1);

    const officialFetch = makeFetch(() => ({ status: 500, body: { reason: "internal_error" } }));
    const official = officialClient(officialFetch.fetchImpl, root);
    const hit = await official.domainSearch({ domain: "shared.example" });
    assert.equal(hit.cached, true);
    assert.equal(officialFetch.calls.length, 0);

    const again = await official.domainSearch({ domain: "shared.example" });
    assert.equal(again.cached, true);
    assert.equal(officialFetch.calls.length, 0);
  });

  it("官方失败或超时不自动重试，下一次出站仍不是 api.hunter.io", async () => {
    const { fetchImpl, calls } = makeFetch((_call, index) => {
      if (index === 1) throw new Error("timeout");
      return {
        status: 429,
        body: { reason: "insufficient_quota" },
      };
    });
    const client = officialClient(fetchImpl, freshRoot());
    await assert.rejects(
      () => client.domainSearch({ domain: "fail.example" }),
      (error: unknown) =>
        error instanceof HunterError &&
        error.code === "OFFICIAL_UPSTREAM_ERROR" &&
        error.message === OFFICIAL_GENERIC_MESSAGE
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url.includes("api.hunter.io"), false);

    await assert.rejects(
      () => client.domainSearch({ domain: "quota.example" }),
      (error: unknown) =>
        error instanceof HunterError &&
        error.code === "OFFICIAL_INSUFFICIENT_QUOTA" &&
        error.message === OFFICIAL_BALANCE_MESSAGE &&
        !error.message.includes("暂时不可用")
    );
    assert.equal(calls.length, 2);
    assert.equal(calls.every((call) => !call.url.includes("api.hunter.io")), true);
    assert.notEqual(calls[0]!.headers?.["X-Request-Id"], calls[1]!.headers?.["X-Request-Id"]);
  });

  it("429 insufficient_quota 与 503 上游不可用、pagination_error 不混用", async () => {
    const { fetchImpl, calls } = makeFetch((call) => {
      const domain = new URL(call.url).searchParams.get("domain") ?? JSON.parse(call.body ?? "{}").domain;
      if (domain === "quota.example") return { status: 429, body: { reason: "insufficient_quota" } };
      if (domain === "down.example") {
        return { status: 503, body: { error: { code: "hunter_upstream_unavailable", message: "hunter_upstream_unavailable" } } };
      }
      return {
        status: 400,
        body: { error: { code: "hunter_invalid_request", message: "hunter_invalid_request", detail: "pagination_error" } },
      };
    });
    const client = officialClient(fetchImpl, freshRoot());
    await assert.rejects(
      () => client.domainSearch({ domain: "quota.example" }),
      (error: unknown) => error instanceof HunterError && error.message === OFFICIAL_BALANCE_MESSAGE
    );
    await assert.rejects(
      () => client.domainSearch({ domain: "down.example" }),
      (error: unknown) =>
        error instanceof HunterError &&
        error.message === OFFICIAL_UNAVAILABLE_MESSAGE &&
        !error.message.includes("余额")
    );
    await assert.rejects(
      () => client.domainSearch({ domain: "page.example" }),
      (error: unknown) =>
        error instanceof HunterError &&
        error.message === OFFICIAL_PAGINATION_MESSAGE &&
        !error.message.includes("余额")
    );
    assert.equal(calls.length, 3);
    assert.equal(calls.every((call) => call.method === "POST" && !call.url.includes("api.hunter.io")), true);
  });

  it("官方缺少网关 sk 时零出站", async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: emptyPage() }));
    const client = officialClient(fetchImpl, freshRoot(), { gatewayApiKey: "" });
    await assert.rejects(
      () => client.domainSearch({ domain: "nokey.example" }),
      (error: unknown) => error instanceof HunterError && error.message === OFFICIAL_CREDENTIAL_MESSAGE
    );
    assert.equal(calls.length, 0);
  });

  it("FTCS_CHANNEL_MODE=official 时即使持有用户 Key 也不直连", async () => {
    process.env.FTCS_CHANNEL_MODE = "official";
    process.env.FTCS_GATEWAY_API_KEY = OFFICIAL_SK;
    process.env.FTCS_TOKEN_GATEWAY_BASE_URL = "https://gw.example/v1/";
    try {
      const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: emptyPage("env.example") }));
      const client = new HunterClient({ keys: [USER_HUNTER_KEY], root: freshRoot(), fetchImpl });
      await client.domainSearch({ domain: "env.example" });
      assert.equal(calls.length, 1);
      assertOfficialPost(calls[0]!, "env.example");
    } finally {
      delete process.env.FTCS_CHANNEL_MODE;
      delete process.env.FTCS_GATEWAY_API_KEY;
      delete process.env.FTCS_TOKEN_GATEWAY_BASE_URL;
    }
  });

  it("自定义通道忽略网关 sk，仍直连 api.hunter.io", async () => {
    process.env.FTCS_GATEWAY_API_KEY = OFFICIAL_SK;
    process.env.FTCS_TOKEN_GATEWAY_BASE_URL = "https://gw.example/v1";
    try {
      const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: PANTRON_DOMAIN_SEARCH_RESPONSE }));
      const client = new HunterClient({
        keys: [K1],
        root: freshRoot(),
        fetchImpl,
        channelMode: "custom",
      });
      const result = await client.domainSearch({ domain: "custom.example" });
      assert.equal(result.cached, false);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]!.url.startsWith("https://api.hunter.io/v2/domain-search"), true);
      assert.equal(calls[0]!.key, K1);
      assert.equal(calls[0]!.authorization, undefined);
      assert.equal(calls[0]!.method, undefined);
      assert.equal(JSON.stringify(calls[0]).includes(OFFICIAL_SK), false);
    } finally {
      delete process.env.FTCS_GATEWAY_API_KEY;
      delete process.env.FTCS_TOKEN_GATEWAY_BASE_URL;
    }
  });

  it("官方 account_info 仍不发 HTTP", async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: okAccount.body }));
    const client = officialClient(fetchImpl, freshRoot());
    await assert.rejects(
      () => client.accountInfo(),
      (error: unknown) =>
        error instanceof HunterError &&
        error.code === "OFFICIAL_ACCOUNT_DISABLED" &&
        error.message === OFFICIAL_ACCOUNT_MESSAGE
    );
    assert.equal(calls.length, 0);
  });

  function assertOfficialVerifierPost(call: FetchCall, email: string) {
    const url = new URL(call.url);
    assert.equal(url.origin + url.pathname, "https://gw.example/v1/hunter/email-verifier");
    assert.equal(url.pathname.includes("/v1/v1/"), false);
    assert.notEqual(url.hostname, "api.hunter.io");
    assert.equal(call.method, "POST");
    assert.equal(call.authorization, `Bearer ${OFFICIAL_SK}`);
    assert.equal(call.key, undefined);
    assert.equal(call.headers?.["Content-Type"], "application/json");
    assert.equal(call.headers?.Accept, "application/json");
    assert.ok(call.headers?.["X-Request-Id"]);
    const payload = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
    assert.deepEqual(payload, { email });
    assert.equal(JSON.stringify(payload).includes(USER_HUNTER_KEY), false);
    assert.equal(JSON.stringify(call.headers).includes(USER_HUNTER_KEY), false);
    assert.equal(JSON.stringify(call.headers).includes("api_key"), false);
    return payload;
  }

  it("官方验邮只 POST 一次，正文只有 email，unknown 是终态", async () => {
    const root = freshRoot();
    const { fetchImpl, calls } = makeFetch(() => ({
      status: 200,
      body: { data: { status: "unknown", score: 10, email: "a@b.com" }, extra: true },
    }));
    const client = officialClient(fetchImpl, root);
    const result = await client.verifyEmail("a@b.com");
    assert.equal(calls.length, 1);
    assertOfficialVerifierPost(calls[0]!, "a@b.com");
    assert.equal(result.status, "unknown");
    assert.equal(result.pending, false);
    assert.equal(result.score, 10);
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    assert.equal(existsSync(join(root, "data", "cache", "hunter")), false);
  });

  it("官方验邮 webmail 原样返回且 pending 为 false", async () => {
    const { fetchImpl, calls } = makeFetch(() => ({
      status: 200,
      body: { data: { status: "webmail", score: null, email: "a@gmail.com" } },
    }));
    const client = officialClient(fetchImpl, freshRoot());
    const result = await client.verifyEmail("a@gmail.com");
    assert.equal(calls.length, 1);
    assert.equal(result.status, "webmail");
    assert.equal(result.pending, false);
  });

  it("官方验邮 504 与 502 各只请求一次，提示不同，且不返回 pending", async () => {
    const { fetchImpl, calls } = makeFetch((call) => {
      const email = JSON.parse(call.body ?? "{}").email;
      if (email === "pending@example.com") {
        return {
          status: 504,
          body: { error: { code: "hunter_verification_pending", message: "hunter_verification_pending" } },
        };
      }
      return {
        status: 502,
        body: { error: { code: "hunter_upstream_error", message: "hunter_upstream_error" } },
      };
    });
    const client = officialClient(fetchImpl, freshRoot());
    await assert.rejects(
      () => client.verifyEmail("pending@example.com"),
      (error: unknown) =>
        error instanceof HunterError &&
        error.code === "OFFICIAL_VERIFY_PENDING" &&
        error.message === OFFICIAL_VERIFY_PENDING_MESSAGE
    );
    await assert.rejects(
      () => client.verifyEmail("down@example.com"),
      (error: unknown) =>
        error instanceof HunterError &&
        error.code === "OFFICIAL_UPSTREAM_ERROR" &&
        error.message === OFFICIAL_VERIFY_FAILED_MESSAGE
    );
    assert.equal(calls.length, 2);
    assert.equal(calls.every((call) => !call.url.includes("api.hunter.io")), true);
    assert.notEqual(calls[0]!.headers?.["X-Request-Id"], calls[1]!.headers?.["X-Request-Id"]);
  });

  it("官方验邮超时只出站一次，不当成尚未完成", async () => {
    assert.equal(OFFICIAL_VERIFIER_TIMEOUT_MS, 90_000);
    let calls = 0;
    const fetchImpl = async (
      _url: string,
      init?: { signal?: AbortSignal; body?: string; headers?: Record<string, string> }
    ) => {
      calls += 1;
      assert.ok(init?.signal);
      assert.equal(init.signal.aborted, false);
      throw new Error("TimeoutError");
    };
    const client = new HunterClient({
      keys: [USER_HUNTER_KEY],
      root: freshRoot(),
      fetchImpl,
      channelMode: "official",
      gatewayApiKey: OFFICIAL_SK,
      gatewayBaseUrl: "https://gw.example/v1/",
    });
    await assert.rejects(
      () => client.verifyEmail("slow@example.com"),
      (error: unknown) =>
        error instanceof HunterError &&
        error.code === "OFFICIAL_UPSTREAM_ERROR" &&
        error.message === OFFICIAL_VERIFY_FAILED_MESSAGE
    );
    assert.equal(calls, 1);
  });

  it("自定义验邮仍直连并轮询，不带官方 sk", async () => {
    let n = 0;
    const { fetchImpl, calls } = makeFetch(() => {
      n += 1;
      return n < 2
        ? { status: 202, body: { data: {} } }
        : { status: 200, body: VERIFIER_VALID_RESPONSE };
    });
    const client = new HunterClient({
      keys: [K1],
      root: freshRoot(),
      fetchImpl,
      channelMode: "custom",
      gatewayApiKey: OFFICIAL_SK,
      gatewayBaseUrl: "https://gw.example/v1",
      sleep: async () => {},
    });
    const result = await client.verifyEmail("steve@pantron.com");
    assert.equal(result.pending, false);
    assert.equal(result.status, "valid");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url.startsWith("https://api.hunter.io/v2/email-verifier")));
    assert.ok(calls.every((call) => call.key === K1));
    assert.equal(JSON.stringify(calls).includes(OFFICIAL_SK), false);
    assert.equal(JSON.stringify(calls).includes("/hunter/email-verifier"), false);
  });
});
