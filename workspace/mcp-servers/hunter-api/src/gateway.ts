import { randomUUID } from "node:crypto";
import { HunterError } from "./errors.js";

/**
 * 官方通道 Hunter 代调（US-HC-01 / 契约附录）。
 * base 已含 /v1，只去尾部斜杠。失败不重试，不回退 api.hunter.io。
 * 验邮代调属于 US-HC-02 / US-HC-03；本模块只提供查找 POST 与错误映射。
 */

export const OFFICIAL_BALANCE_MESSAGE =
  "官方通道余额不足。请到设置 → 模型通道查看余额并充值。";
export const OFFICIAL_CREDENTIAL_MESSAGE =
  "官方通道凭证不可用。请到设置 → 模型通道登录、开通或检查官方通道。";
export const OFFICIAL_UNAVAILABLE_MESSAGE = "补全联系人暂时不可用，请稍后再试。";
export const OFFICIAL_RATE_LIMIT_MESSAGE = "请求过于频繁，请稍后重试。";
export const OFFICIAL_GENERIC_MESSAGE = "补全联系人暂时失败，请稍后重试。";
export const OFFICIAL_PAGINATION_MESSAGE = "当前查找范围超出限制。";
export const OFFICIAL_CLAIMED_MESSAGE =
  "该邮箱持有人已要求停止处理其数据，本次不再处理该邮箱。";
export const OFFICIAL_VERIFY_PENDING_MESSAGE = "验证尚未完成，请稍后再次验证。";
export const OFFICIAL_VERIFY_REMOVED_MESSAGE =
  "官方通道不使用自备 Hunter Key 验证邮箱，本次不会直连 Hunter。";
export const OFFICIAL_ACCOUNT_MESSAGE =
  "官方通道不查询 Hunter 账号额度，余额请到设置里的官方账户查看。";

const DEFAULT_GATEWAY_BASE = "https://token.ai-utills.com/v1";

const CREDENTIAL_REASONS = new Set([
  "missing_authorization",
  "invalid_authorization",
  "invalid_api_key",
  "key_disabled",
  "account_disabled",
]);

export interface HunterFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HunterFetchResponse {
  status: number;
  json: () => Promise<unknown>;
}

export type HunterFetchLike = (
  url: string,
  init?: HunterFetchInit
) => Promise<HunterFetchResponse>;

export interface OfficialDomainSearchParams {
  domain: string;
  limit?: number;
  type?: string;
  department?: string;
  seniority?: string;
}

/** 与搜索侧 getGatewayBaseUrl 相同：已含 /v1，只去掉末尾斜杠。 */
export function normalizeHunterGatewayBase(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  return (trimmed || DEFAULT_GATEWAY_BASE).replace(/\/+$/, "");
}

export function buildOfficialDomainSearchBody(
  params: OfficialDomainSearchParams
): Record<string, string | number> {
  const body: Record<string, string | number> = {
    domain: params.domain,
    limit: params.limit ?? 10,
  };
  if (params.type === "personal" || params.type === "generic") {
    body.type = params.type;
  }
  const department = params.department?.trim();
  if (department) body.department = department;
  const seniority = params.seniority?.trim();
  if (seniority) body.seniority = seniority;
  return body;
}

interface OfficialErrorFields {
  code?: string;
  detail?: string;
  reason?: string;
}

export function readOfficialErrorFields(body: unknown): OfficialErrorFields {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const record = body as Record<string, unknown>;
  let code: string | undefined;
  let detail: string | undefined;
  const error = record.error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.code === "string" && errorRecord.code.trim()) {
      code = errorRecord.code.trim();
    }
    if (typeof errorRecord.detail === "string") detail = errorRecord.detail;
  }
  if (!detail && typeof record.detail === "string") detail = record.detail;
  const reason =
    typeof record.reason === "string" && record.reason.trim()
      ? record.reason.trim()
      : undefined;
  return { code, detail, reason };
}

function genericFailure(status?: number): HunterError {
  return new HunterError("OFFICIAL_UPSTREAM_ERROR", OFFICIAL_GENERIC_MESSAGE, status);
}

function mapBusinessCode(status: number, code: string, detail?: string): HunterError {
  if (code === "hunter_invalid_request") {
    if (detail === "pagination_error") {
      return new HunterError("OFFICIAL_PAGINATION_ERROR", OFFICIAL_PAGINATION_MESSAGE, status);
    }
    return genericFailure(status);
  }
  if (code === "hunter_claimed_email") {
    return new HunterError("OFFICIAL_CLAIMED_EMAIL", OFFICIAL_CLAIMED_MESSAGE, status);
  }
  if (code === "hunter_smtp_retryable") {
    return new HunterError("OFFICIAL_SMTP_RETRYABLE", OFFICIAL_GENERIC_MESSAGE, status);
  }
  if (code === "hunter_rate_limited") {
    return new HunterError("OFFICIAL_RATE_LIMITED", OFFICIAL_RATE_LIMIT_MESSAGE, status);
  }
  if (code === "hunter_upstream_unavailable" || code === "hunter_pricing_unavailable") {
    return new HunterError("OFFICIAL_UNAVAILABLE", OFFICIAL_UNAVAILABLE_MESSAGE, status);
  }
  if (code === "hunter_upstream_error") {
    return new HunterError("OFFICIAL_UPSTREAM_ERROR", OFFICIAL_GENERIC_MESSAGE, status);
  }
  if (code === "hunter_verification_pending") {
    return new HunterError("OFFICIAL_VERIFY_PENDING", OFFICIAL_VERIFY_PENDING_MESSAGE, status);
  }
  return genericFailure(status);
}

function mapFrameworkReason(status: number, reason: string): HunterError {
  if (CREDENTIAL_REASONS.has(reason)) {
    return new HunterError("OFFICIAL_CREDENTIAL_UNAVAILABLE", OFFICIAL_CREDENTIAL_MESSAGE, status);
  }
  if (reason === "insufficient_quota") {
    return new HunterError("OFFICIAL_INSUFFICIENT_QUOTA", OFFICIAL_BALANCE_MESSAGE, status);
  }
  if (reason === "missing_gateway_key_pepper") {
    return new HunterError("OFFICIAL_UNAVAILABLE", OFFICIAL_UNAVAILABLE_MESSAGE, status);
  }
  return genericFailure(status);
}

/** 先认 error.code，再认 reason。未知码与非 JSON 都是通用失败，不当余额不足。 */
export function mapOfficialHunterFailure(status: number, body: unknown): HunterError {
  const fields = readOfficialErrorFields(body);
  if (fields.code) return mapBusinessCode(status, fields.code, fields.detail);
  if (fields.reason) return mapFrameworkReason(status, fields.reason);
  return genericFailure(status);
}

export function officialVerifyRemovedError(): HunterError {
  return new HunterError("OFFICIAL_VERIFY_DIRECT_REMOVED", OFFICIAL_VERIFY_REMOVED_MESSAGE);
}

export function officialAccountDisabledError(): HunterError {
  return new HunterError("OFFICIAL_ACCOUNT_DISABLED", OFFICIAL_ACCOUNT_MESSAGE);
}

export async function postOfficialDomainSearch(input: {
  params: OfficialDomainSearchParams;
  gatewayApiKey: string;
  gatewayBaseUrl: string;
  fetchImpl: HunterFetchLike;
}): Promise<unknown> {
  const apiKey = input.gatewayApiKey.trim();
  if (!apiKey) {
    throw new HunterError("OFFICIAL_CREDENTIAL_UNAVAILABLE", OFFICIAL_CREDENTIAL_MESSAGE, 401);
  }

  const url = `${normalizeHunterGatewayBase(input.gatewayBaseUrl)}/hunter/domain-search`;
  let response: HunterFetchResponse;
  try {
    response = await input.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Request-Id": randomUUID(),
      },
      body: JSON.stringify(buildOfficialDomainSearchBody(input.params)),
    });
  } catch {
    throw new HunterError("OFFICIAL_UPSTREAM_ERROR", OFFICIAL_GENERIC_MESSAGE);
  }

  let body: unknown;
  let parsedJson = false;
  try {
    body = await response.json();
    parsedJson = true;
  } catch {
    parsedJson = false;
  }

  if (response.status !== 200) {
    throw mapOfficialHunterFailure(response.status, parsedJson ? body : undefined);
  }
  if (!parsedJson) {
    throw new HunterError("OFFICIAL_UPSTREAM_ERROR", OFFICIAL_GENERIC_MESSAGE, response.status);
  }
  return body;
}
