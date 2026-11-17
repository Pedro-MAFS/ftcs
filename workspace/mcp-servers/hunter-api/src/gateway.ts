import { randomUUID } from "node:crypto";
import { HunterError } from "./errors.js";

/**
 * 官方通道 Hunter 代调（US-HC-01 / 契约附录）。
 * base 已含 /v1，只去尾部斜杠。失败不重试，不回退 api.hunter.io。
 * 验邮代调是单次 POST，客户端不轮询 202。抽屉验邮仍归 US-HC-03。
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
export const OFFICIAL_VERIFY_FAILED_MESSAGE = "验证暂时失败，请稍后重试。";
export const OFFICIAL_VERIFIER_TIMEOUT_MS = 90_000;
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

export type OfficialHunterOperation = "domain-search" | "email-verifier";

export interface HunterFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
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
  offset?: number;
}

/** 只保留调用方真正传入的有限数字和已填写筛选。不代填 limit，不把空串写成 null。 */
export function normalizeDomainSearchParams(
  params: OfficialDomainSearchParams
): OfficialDomainSearchParams {
  const normalized: OfficialDomainSearchParams = { domain: params.domain };
  if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
    normalized.limit = params.limit;
  }
  if (params.type === "personal" || params.type === "generic") {
    normalized.type = params.type;
  }
  const department = params.department?.trim();
  if (department) normalized.department = department;
  const seniority = params.seniority?.trim();
  if (seniority) normalized.seniority = seniority;
  if (typeof params.offset === "number" && Number.isFinite(params.offset)) {
    normalized.offset = params.offset;
  }
  return normalized;
}

/** 与搜索侧 getGatewayBaseUrl 相同：已含 /v1，只去掉末尾斜杠。 */
export function normalizeHunterGatewayBase(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  return (trimmed || DEFAULT_GATEWAY_BASE).replace(/\/+$/, "");
}

export function buildOfficialDomainSearchBody(
  params: OfficialDomainSearchParams
): Record<string, string | number> {
  const normalized = normalizeDomainSearchParams(params);
  const body: Record<string, string | number> = { domain: normalized.domain };
  if (normalized.limit !== undefined) body.limit = normalized.limit;
  if (normalized.offset !== undefined) body.offset = normalized.offset;
  if (normalized.type) body.type = normalized.type;
  if (normalized.department) body.department = normalized.department;
  if (normalized.seniority) body.seniority = normalized.seniority;
  return body;
}

/** 自定义直连查询串与官方正文同一组可选字段。省略的字段不出现。 */
export function buildDirectDomainSearchQuery(
  params: OfficialDomainSearchParams
): Record<string, string> {
  const body = buildOfficialDomainSearchBody(params);
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(body)) {
    query[name] = String(value);
  }
  return query;
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

function failureMessage(operation: OfficialHunterOperation): string {
  return operation === "email-verifier" ? OFFICIAL_VERIFY_FAILED_MESSAGE : OFFICIAL_GENERIC_MESSAGE;
}

function genericFailure(status: number | undefined, operation: OfficialHunterOperation): HunterError {
  return new HunterError("OFFICIAL_UPSTREAM_ERROR", failureMessage(operation), status);
}

function mapBusinessCode(
  status: number,
  code: string,
  detail: string | undefined,
  operation: OfficialHunterOperation
): HunterError {
  if (code === "hunter_invalid_request") {
    if (detail === "pagination_error") {
      return new HunterError("OFFICIAL_PAGINATION_ERROR", OFFICIAL_PAGINATION_MESSAGE, status);
    }
    return genericFailure(status, operation);
  }
  if (code === "hunter_claimed_email") {
    return new HunterError("OFFICIAL_CLAIMED_EMAIL", OFFICIAL_CLAIMED_MESSAGE, status);
  }
  if (code === "hunter_smtp_retryable") {
    return new HunterError("OFFICIAL_SMTP_RETRYABLE", failureMessage(operation), status);
  }
  if (code === "hunter_rate_limited") {
    return new HunterError("OFFICIAL_RATE_LIMITED", OFFICIAL_RATE_LIMIT_MESSAGE, status);
  }
  if (code === "hunter_upstream_unavailable" || code === "hunter_pricing_unavailable") {
    return new HunterError("OFFICIAL_UNAVAILABLE", OFFICIAL_UNAVAILABLE_MESSAGE, status);
  }
  if (code === "hunter_upstream_error") {
    return new HunterError("OFFICIAL_UPSTREAM_ERROR", failureMessage(operation), status);
  }
  if (code === "hunter_verification_pending") {
    return new HunterError("OFFICIAL_VERIFY_PENDING", OFFICIAL_VERIFY_PENDING_MESSAGE, status);
  }
  return genericFailure(status, operation);
}

function mapFrameworkReason(
  status: number,
  reason: string,
  operation: OfficialHunterOperation
): HunterError {
  if (CREDENTIAL_REASONS.has(reason)) {
    return new HunterError("OFFICIAL_CREDENTIAL_UNAVAILABLE", OFFICIAL_CREDENTIAL_MESSAGE, status);
  }
  if (reason === "insufficient_quota") {
    return new HunterError("OFFICIAL_INSUFFICIENT_QUOTA", OFFICIAL_BALANCE_MESSAGE, status);
  }
  if (reason === "missing_gateway_key_pepper") {
    return new HunterError("OFFICIAL_UNAVAILABLE", OFFICIAL_UNAVAILABLE_MESSAGE, status);
  }
  return genericFailure(status, operation);
}

/** 先认 error.code，再认 reason。未知码与非 JSON 都是通用失败，不当余额不足。 */
export function mapOfficialHunterFailure(
  status: number,
  body: unknown,
  operation: OfficialHunterOperation = "domain-search"
): HunterError {
  const fields = readOfficialErrorFields(body);
  if (fields.code) return mapBusinessCode(status, fields.code, fields.detail, operation);
  if (fields.reason) return mapFrameworkReason(status, fields.reason, operation);
  return genericFailure(status, operation);
}

export function officialAccountDisabledError(): HunterError {
  return new HunterError("OFFICIAL_ACCOUNT_DISABLED", OFFICIAL_ACCOUNT_MESSAGE);
}

function officialJsonHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Request-Id": randomUUID(),
  };
}

async function postOfficialOnce(input: {
  url: string;
  apiKey: string;
  body: string;
  fetchImpl: HunterFetchLike;
  signal?: AbortSignal;
  operation: OfficialHunterOperation;
}): Promise<unknown> {
  let response: HunterFetchResponse;
  try {
    response = await input.fetchImpl(input.url, {
      method: "POST",
      headers: officialJsonHeaders(input.apiKey),
      body: input.body,
      signal: input.signal,
    });
  } catch {
    throw new HunterError("OFFICIAL_UPSTREAM_ERROR", failureMessage(input.operation));
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
    throw mapOfficialHunterFailure(response.status, parsedJson ? body : undefined, input.operation);
  }
  if (!parsedJson) {
    throw new HunterError(
      "OFFICIAL_UPSTREAM_ERROR",
      failureMessage(input.operation),
      response.status
    );
  }
  return body;
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
  return postOfficialOnce({
    url: `${normalizeHunterGatewayBase(input.gatewayBaseUrl)}/hunter/domain-search`,
    apiKey,
    body: JSON.stringify(buildOfficialDomainSearchBody(input.params)),
    fetchImpl: input.fetchImpl,
    operation: "domain-search",
  });
}

/** 官方验邮：一次 POST，90 秒超时，不轮询 202，失败不重放。 */
export async function postOfficialEmailVerifier(input: {
  email: string;
  gatewayApiKey: string;
  gatewayBaseUrl: string;
  fetchImpl: HunterFetchLike;
  timeoutMs?: number;
}): Promise<unknown> {
  const apiKey = input.gatewayApiKey.trim();
  if (!apiKey) {
    throw new HunterError("OFFICIAL_CREDENTIAL_UNAVAILABLE", OFFICIAL_CREDENTIAL_MESSAGE, 401);
  }
  const timeoutMs = input.timeoutMs ?? OFFICIAL_VERIFIER_TIMEOUT_MS;
  return postOfficialOnce({
    url: `${normalizeHunterGatewayBase(input.gatewayBaseUrl)}/hunter/email-verifier`,
    apiKey,
    body: JSON.stringify({ email: input.email }),
    fetchImpl: input.fetchImpl,
    signal: AbortSignal.timeout(timeoutMs),
    operation: "email-verifier",
  });
}
