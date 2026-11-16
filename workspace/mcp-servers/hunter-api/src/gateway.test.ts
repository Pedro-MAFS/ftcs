import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HunterError } from "./errors.js";
import {
  OFFICIAL_BALANCE_MESSAGE,
  OFFICIAL_CREDENTIAL_MESSAGE,
  OFFICIAL_GENERIC_MESSAGE,
  OFFICIAL_PAGINATION_MESSAGE,
  OFFICIAL_RATE_LIMIT_MESSAGE,
  OFFICIAL_UNAVAILABLE_MESSAGE,
  OFFICIAL_VERIFY_PENDING_MESSAGE,
  buildOfficialDomainSearchBody,
  mapOfficialHunterFailure,
  normalizeHunterGatewayBase,
  postOfficialDomainSearch,
} from "./gateway.js";

describe("official hunter gateway", () => {
  it("base 只去尾斜杠，不追加第二段 /v1", () => {
    assert.equal(normalizeHunterGatewayBase("https://gw.example/v1/"), "https://gw.example/v1");
    assert.equal(normalizeHunterGatewayBase(""), "https://token.ai-utills.com/v1");
    assert.equal(
      `${normalizeHunterGatewayBase("https://gw.example/v1/")}/hunter/domain-search`.includes("/v1/v1/"),
      false
    );
  });

  it("正文省略空字段，不带 api_key 或 offset", () => {
    assert.deepEqual(buildOfficialDomainSearchBody({ domain: "acme.com" }), {
      domain: "acme.com",
      limit: 10,
    });
    assert.deepEqual(
      buildOfficialDomainSearchBody({
        domain: "acme.com",
        limit: 10,
        type: "personal",
        department: " ",
        seniority: "executive",
      }),
      { domain: "acme.com", limit: 10, type: "personal", seniority: "executive" }
    );
  });

  it("429 insufficient_quota 是余额，503 上游不可用不是余额", () => {
    const quota = mapOfficialHunterFailure(429, { reason: "insufficient_quota" });
    assert.equal(quota.message, OFFICIAL_BALANCE_MESSAGE);
    assert.equal(quota.code, "OFFICIAL_INSUFFICIENT_QUOTA");

    const down = mapOfficialHunterFailure(503, {
      error: { code: "hunter_upstream_unavailable", message: "hunter_upstream_unavailable" },
    });
    assert.equal(down.message, OFFICIAL_UNAVAILABLE_MESSAGE);
    assert.equal(down.message.includes("余额"), false);
    assert.equal(down.message.includes("Hunter Key"), false);

    const pricing = mapOfficialHunterFailure(503, {
      error: { code: "hunter_pricing_unavailable", message: "hunter_pricing_unavailable" },
    });
    assert.equal(pricing.message, OFFICIAL_UNAVAILABLE_MESSAGE);

    const limited = mapOfficialHunterFailure(503, {
      error: { code: "hunter_rate_limited", message: "hunter_rate_limited" },
    });
    assert.equal(limited.message, OFFICIAL_RATE_LIMIT_MESSAGE);
    assert.equal(limited.message.includes("余额"), false);

    const bare429 = mapOfficialHunterFailure(429, { reason: "too_many" });
    assert.equal(bare429.message, OFFICIAL_GENERIC_MESSAGE);
    assert.notEqual(bare429.message, OFFICIAL_BALANCE_MESSAGE);
  });

  it("pagination_error 不是余额不足；未知 code 不改认 reason", () => {
    const page = mapOfficialHunterFailure(400, {
      error: { code: "hunter_invalid_request", message: "hunter_invalid_request", detail: "pagination_error" },
    });
    assert.equal(page.message, OFFICIAL_PAGINATION_MESSAGE);

    const otherDetail = mapOfficialHunterFailure(400, {
      error: { code: "hunter_invalid_request", message: "bad", detail: "domain" },
    });
    assert.equal(otherDetail.message, OFFICIAL_GENERIC_MESSAGE);
    assert.equal(otherDetail.message.includes("domain"), false);

    const unknown = mapOfficialHunterFailure(429, {
      error: { code: "something_else", message: "something_else" },
      reason: "insufficient_quota",
    });
    assert.equal(unknown.message, OFFICIAL_GENERIC_MESSAGE);
  });

  it("401/403 凭证、非 JSON、504 与 502 分开", () => {
    for (const reason of ["missing_authorization", "invalid_authorization", "invalid_api_key"]) {
      assert.equal(mapOfficialHunterFailure(401, { reason }).message, OFFICIAL_CREDENTIAL_MESSAGE);
    }
    for (const reason of ["key_disabled", "account_disabled"]) {
      assert.equal(mapOfficialHunterFailure(403, { reason }).message, OFFICIAL_CREDENTIAL_MESSAGE);
    }
    assert.equal(mapOfficialHunterFailure(500, undefined).message, OFFICIAL_GENERIC_MESSAGE);
    assert.equal(
      mapOfficialHunterFailure(502, { error: { code: "hunter_upstream_error", message: "x" } }).message,
      OFFICIAL_GENERIC_MESSAGE
    );
    assert.equal(
      mapOfficialHunterFailure(504, {
        error: { code: "hunter_verification_pending", message: "hunter_verification_pending" },
      }).message,
      OFFICIAL_VERIFY_PENDING_MESSAGE
    );
  });

  it("非 JSON 错误体只请求一次，并返回通用失败", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        postOfficialDomainSearch({
          params: { domain: "plain.example", limit: 10 },
          gatewayApiKey: "sk-official",
          gatewayBaseUrl: "https://gw.example/v1/",
          fetchImpl: async (url, init) => {
            calls += 1;
            assert.equal(url, "https://gw.example/v1/hunter/domain-search");
            assert.equal(init?.method, "POST");
            assert.equal(init?.headers?.Authorization, "Bearer sk-official");
            assert.equal(init?.body?.includes("api_key"), false);
            return {
              status: 502,
              json: async () => {
                throw new Error("not json");
              },
            };
          },
        }),
      (error: unknown) => error instanceof HunterError && error.message === OFFICIAL_GENERIC_MESSAGE
    );
    assert.equal(calls, 1);
  });
});
