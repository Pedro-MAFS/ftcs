import { readDomainSearchCache, writeDomainSearchCache, type DomainSearchCacheKey } from "./cache.js";
import { HunterError } from "./errors.js";
import {
  OFFICIAL_GENERIC_MESSAGE,
  OFFICIAL_PAGINATION_MESSAGE,
  OFFICIAL_VERIFY_FAILED_MESSAGE,
  buildDirectDomainSearchQuery,
  normalizeDomainSearchParams,
  officialAccountDisabledError,
  postOfficialDomainSearch,
  postOfficialEmailVerifier,
  type HunterFetchLike,
  type OfficialDomainSearchParams,
} from "./gateway.js";
import {
  describeKeyPool,
  keyTail,
  markKeyExhausted,
  markKeyInvalid,
  pickAvailableKey,
} from "./key-pool.js";
import {
  HunterAccountDataSchema,
  HunterDomainSearchResponseSchema,
  HunterErrorBodySchema,
  HunterVerifierDataSchema,
  trimDomainSearch,
  type HunterAccountData,
  type HunterVerifierData,
  type TrimmedDomainSearch,
} from "./types.js";

export { HunterError } from "./errors.js";

/**
 * Hunter REST 客户端（US-C-02 详设 §3/§6）：
 * - X-API-Key Header 认证（Key 不进 URL / 日志）
 * - 多 Key failover：429 标记 exhausted（并免费调 account 学 reset_date）、401 标记 invalid
 * - Verifier 202 轮询：每 2s 同一 URL，总预算 24s，固定发起 Key
 */

const BASE_URL = "https://api.hunter.io/v2";
const VERIFIER_POLL_INTERVAL_MS = 2000;
const VERIFIER_POLL_BUDGET_MS = 24000;

export interface HunterClientOptions {
  keys: string[];
  root: string;
  fetchImpl?: HunterFetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** 显式通道。缺省读 FTCS_CHANNEL_MODE，仅 official 走代调。 */
  channelMode?: "official" | "custom";
  gatewayApiKey?: string;
  gatewayBaseUrl?: string;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readOfficialVerifier(
  body: unknown,
  fallbackEmail: string
): HunterVerifierData & { pending: false } {
  const data =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { data?: unknown }).data
      : undefined;
  const record =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  const status = typeof record?.status === "string" ? record.status.trim() : "";
  if (!status) {
    throw new HunterError("OFFICIAL_UPSTREAM_ERROR", OFFICIAL_VERIFY_FAILED_MESSAGE, 200);
  }
  const score = record?.score;
  const email = record?.email;
  return {
    status,
    score: typeof score === "number" && Number.isFinite(score) ? score : null,
    email: typeof email === "string" && email.trim() ? email : fallbackEmail,
    regexp: null,
    gibberish: null,
    disposable: null,
    webmail: null,
    mx_records: null,
    smtp_server: null,
    smtp_check: null,
    accept_all: null,
    block: null,
    pending: false,
  };
}

function parseErrorDetails(body: unknown): string {
  const parsed = HunterErrorBodySchema.safeParse(body);
  if (parsed.success && parsed.data.errors.length > 0) {
    return parsed.data.errors.map((e) => e.details).join("; ");
  }
  return "";
}

function firstErrorId(body: unknown): string {
  const parsed = HunterErrorBodySchema.safeParse(body);
  if (parsed.success && parsed.data.errors.length > 0) {
    return parsed.data.errors[0]?.id ?? "";
  }
  return "";
}

export class HunterClient {
  private readonly keys: string[];
  private readonly root: string;
  private readonly fetchImpl: HunterFetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly channelMode?: "official" | "custom";
  private readonly gatewayApiKey?: string;
  private readonly gatewayBaseUrl?: string;

  constructor(options: HunterClientOptions) {
    this.keys = options.keys;
    this.root = options.root;
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) =>
        fetch(url, {
          method: init?.method,
          headers: init?.headers,
          body: init?.body,
          signal: init?.signal,
        }) as never);
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => new Date());
    this.channelMode = options.channelMode;
    this.gatewayApiKey = options.gatewayApiKey;
    this.gatewayBaseUrl = options.gatewayBaseUrl;
  }

  /** 只认通道标记。禁止按「有没有用户 Key」决定直连还是代调。 */
  private isOfficial(): boolean {
    if (this.channelMode) return this.channelMode === "official";
    return (process.env.FTCS_CHANNEL_MODE ?? "").trim() === "official";
  }

  private resolveGatewayApiKey(): string {
    return (this.gatewayApiKey ?? process.env.FTCS_GATEWAY_API_KEY ?? "").trim();
  }

  private resolveGatewayBaseUrl(): string {
    return (this.gatewayBaseUrl ?? process.env.FTCS_TOKEN_GATEWAY_BASE_URL ?? "").trim();
  }

  /** 账户配额（免费）。429 时用它学 reset_date；account_info 工具用 per-key 版本。 */
  private async fetchAccountData(apiKey: string): Promise<HunterAccountData | null> {
    try {
      const res = await this.fetchImpl(`${BASE_URL}/account`, {
        headers: { "X-API-Key": apiKey },
      });
      if (res.status !== 200) {
        return null;
      }
      const body = (await res.json()) as { data?: unknown };
      const parsed = HunterAccountDataSchema.safeParse(body.data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async requestOnce(
    path: string,
    params: Record<string, string>,
    apiKey: string
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    let res;
    try {
      res = await this.fetchImpl(url.toString(), {
        headers: { "X-API-Key": apiKey },
      });
    } catch (error) {
      throw new HunterError(
        "HUNTER_UPSTREAM_ERROR",
        `无法连接 Hunter API：${error instanceof Error ? error.message : String(error)}`
      );
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  }

  /**
   * 带 failover 的请求：按 Key 池顺序尝试；429/401 标记后切下一个。
   * 其他错误（403/400/451/5xx）不切换，直接抛出。
   */
  private async requestWithFailover(
    path: string,
    params: Record<string, string>
  ): Promise<{ body: unknown; apiKey: string }> {
    if (this.keys.length === 0) {
      throw new HunterError(
        "HUNTER_NO_KEY",
        "未配置 Hunter API Key。请在设置 → 集成中填写 Hunter API Key（支持多个，逗号分隔）。"
      );
    }

    let lastAuthError: HunterError | null = null;

    for (;;) {
      const apiKey = pickAvailableKey(this.root, this.keys, this.now());
      if (!apiKey) {
        throw this.allKeysUnavailableError(lastAuthError);
      }

      const { status, body } = await this.requestOnce(path, params, apiKey);

      if (status === 200 || status === 202) {
        return { body, apiKey };
      }

      if (status === 401) {
        markKeyInvalid(this.root, apiKey);
        lastAuthError = new HunterError(
          "HUNTER_UNAUTHORIZED",
          `Hunter API Key 无效（…${keyTail(apiKey)}）。请在设置 → 集成中检查或更换 Key。`,
          401
        );
        continue;
      }

      if (status === 429) {
        const account = await this.fetchAccountData(apiKey);
        markKeyExhausted(this.root, apiKey, account?.reset_date ?? null);
        continue;
      }

      throw this.mapHttpError(status, body);
    }
  }

  private allKeysUnavailableError(lastAuthError: HunterError | null): HunterError {
    const pool = describeKeyPool(this.root, this.keys, this.now());
    const anyExhausted = pool.some((k) => k.status === "exhausted");
    if (anyExhausted) {
      if (this.keys.length === 1) {
        const only = pool[0]!;
        return new HunterError(
          "HUNTER_QUOTA_EXCEEDED",
          `Hunter 额度已用尽（…${only.tail}），${only.exhausted_until ?? "次日"} 重置。请充值 Hunter 或在设置中添加更多 Key。`,
          429
        );
      }
      const lines = pool
        .map(
          (k) =>
            `…${k.tail}: ${k.status === "exhausted" ? `额度用尽（${k.exhausted_until ?? "次日"}重置）` : k.status === "invalid" ? "Key 无效" : "可用"}`
        )
        .join("；");
      return new HunterError(
        "HUNTER_ALL_KEYS_EXHAUSTED",
        `所有 Hunter API Key 额度均不可用：${lines}。请充值 Hunter 或在设置中添加更多 Key。`,
        429
      );
    }
    return (
      lastAuthError ??
      new HunterError(
        "HUNTER_UNAUTHORIZED",
        "Hunter API Key 无效。请在设置 → 集成中检查或更换 Key。",
        401
      )
    );
  }

  private mapHttpError(status: number, body: unknown): HunterError {
    const details = parseErrorDetails(body);
    const errorId = firstErrorId(body);

    if (status === 400) {
      if (errorId === "pagination_error") {
        return new HunterError("HUNTER_PAGINATION_ERROR", OFFICIAL_PAGINATION_MESSAGE, 400);
      }
      return new HunterError(
        "HUNTER_INVALID_PARAMS",
        `Hunter 请求参数错误：${details || "请检查入参"}`,
        400
      );
    }
    if (status === 403) {
      return new HunterError(
        "HUNTER_RATE_LIMITED",
        "Hunter API 速率超限，请稍后重试。",
        403
      );
    }
    if (status === 451) {
      return new HunterError(
        "HUNTER_CLAIMED_EMAIL",
        "该邮箱持有人已要求停止处理其数据（claimed_email），不得再处理该邮箱。",
        451
      );
    }
    if (status === 222) {
      return new HunterError(
        "HUNTER_SMTP_RETRYABLE",
        "Hunter 远端 SMTP 探测异常，建议稍后重试。",
        222
      );
    }
    if (status >= 500) {
      return new HunterError(
        "HUNTER_UPSTREAM_ERROR",
        `Hunter 服务端错误（HTTP ${status}），可稍后重试。`,
        status
      );
    }
    return new HunterError(
      "HUNTER_UPSTREAM_ERROR",
      `Hunter 返回未预期的 HTTP ${status}${details ? `：${details}` : ""}`,
      status
    );
  }

  /** Domain Search：缓存 24h；成功响应裁剪后写缓存。一次调用最多出站一次。 */
  async domainSearch(
    params: OfficialDomainSearchParams
  ): Promise<TrimmedDomainSearch & { cached: boolean }> {
    const normalized = normalizeDomainSearchParams(params);
    const cacheKey: DomainSearchCacheKey = {
      domain: normalized.domain,
      ...(normalized.limit !== undefined ? { limit: normalized.limit } : {}),
      ...(normalized.type ? { type: normalized.type } : {}),
      ...(normalized.department ? { department: normalized.department } : {}),
      ...(normalized.seniority ? { seniority: normalized.seniority } : {}),
      ...(normalized.offset !== undefined ? { offset: normalized.offset } : {}),
    };

    const cached = readDomainSearchCache(this.root, cacheKey, this.now().getTime());
    if (cached) {
      return { ...cached, cached: true };
    }

    if (this.isOfficial()) {
      return this.domainSearchOfficial(normalized, cacheKey);
    }
    return this.domainSearchDirect(normalized, cacheKey);
  }

  /** 官方：单次 POST {base}/hunter/domain-search。失败即结束，不换 Key、不重试、不直连。 */
  private async domainSearchOfficial(
    params: OfficialDomainSearchParams,
    cacheKey: DomainSearchCacheKey
  ): Promise<TrimmedDomainSearch & { cached: boolean }> {
    const body = await postOfficialDomainSearch({
      params,
      gatewayApiKey: this.resolveGatewayApiKey(),
      gatewayBaseUrl: this.resolveGatewayBaseUrl(),
      fetchImpl: this.fetchImpl,
    });
    let parsed;
    try {
      parsed = HunterDomainSearchResponseSchema.parse(body);
    } catch {
      throw new HunterError("OFFICIAL_UPSTREAM_ERROR", OFFICIAL_GENERIC_MESSAGE, 200);
    }
    const trimmed = trimDomainSearch(
      parsed.data,
      parsed.meta?.results ?? parsed.data.emails.length
    );
    writeDomainSearchCache(this.root, cacheKey, trimmed);
    return { ...trimmed, cached: false };
  }

  /** 自定义：直连 api.hunter.io，保留多 Key failover。不代翻页。 */
  private async domainSearchDirect(
    params: OfficialDomainSearchParams,
    cacheKey: DomainSearchCacheKey
  ): Promise<TrimmedDomainSearch & { cached: boolean }> {
    const query = buildDirectDomainSearchQuery(params);

    const { body } = await this.requestWithFailover("/domain-search", query);
    const parsed = HunterDomainSearchResponseSchema.parse(body);
    const trimmed = trimDomainSearch(parsed.data, parsed.meta?.results ?? parsed.data.emails.length);
    writeDomainSearchCache(this.root, cacheKey, trimmed);
    return { ...trimmed, cached: false };
  }

  /**
   * Email Verifier。
   * 自定义：202 时按同一 URL 轮询（固定发起 Key），总预算 24s。
   * 官方：一次网关 POST，不读用户 Key，不轮询，失败不重试。
   */
  async verifyEmail(email: string): Promise<HunterVerifierData & { pending: boolean }> {
    if (this.isOfficial()) {
      return this.verifyEmailOfficial(email);
    }
    const startedAt = this.now().getTime();
    let apiKey = pickAvailableKey(this.root, this.keys, this.now());
    if (!apiKey) {
      if (this.keys.length === 0) {
        throw new HunterError(
          "HUNTER_NO_KEY",
          "未配置 Hunter API Key。请在设置 → 集成中填写 Hunter API Key（支持多个，逗号分隔）。"
        );
      }
      throw this.allKeysUnavailableError(null);
    }

    for (;;) {
      // 202 轮询固定用发起 Key（credit 记在它头上，详设 §3.0）
      const { status, body } = await this.requestOnce("/email-verifier", { email }, apiKey);

      if (status === 200) {
        const data = HunterVerifierDataSchema.parse((body as { data: unknown }).data);
        return { ...data, pending: false };
      }

      if (status === 202) {
        if (this.now().getTime() - startedAt + VERIFIER_POLL_INTERVAL_MS > VERIFIER_POLL_BUDGET_MS) {
          return {
            status: "unknown",
            score: null,
            email,
            regexp: null,
            gibberish: null,
            disposable: null,
            webmail: null,
            mx_records: null,
            smtp_server: null,
            smtp_check: null,
            accept_all: null,
            block: null,
            pending: true,
          };
        }
        await this.sleep(VERIFIER_POLL_INTERVAL_MS);
        continue;
      }

      if (status === 401) {
        markKeyInvalid(this.root, apiKey);
        const next = pickAvailableKey(this.root, this.keys, this.now());
        if (!next) {
          throw this.allKeysUnavailableError(null);
        }
        apiKey = next;
        continue;
      }

      if (status === 429) {
        const account = await this.fetchAccountData(apiKey);
        markKeyExhausted(this.root, apiKey, account?.reset_date ?? null);
        const next = pickAvailableKey(this.root, this.keys, this.now());
        if (!next) {
          throw this.allKeysUnavailableError(null);
        }
        apiKey = next;
        continue;
      }

      throw this.mapHttpError(status, body);
    }
  }

  /** 官方验邮。200 的 unknown 仍是终态，pending 固定 false。504/502 抛错，不返回 pending。 */
  private async verifyEmailOfficial(
    email: string
  ): Promise<HunterVerifierData & { pending: false }> {
    const body = await postOfficialEmailVerifier({
      email,
      gatewayApiKey: this.resolveGatewayApiKey(),
      gatewayBaseUrl: this.resolveGatewayBaseUrl(),
      fetchImpl: this.fetchImpl,
    });
    return readOfficialVerifier(body, email);
  }

  /**
   * 账户配额（免费，不耗 credit）。
   * 单 Key：直接返回 data 字段（向后兼容）；多 Key：返回 keys[] 逐条报告 + total_remaining。
   */
  async accountInfo(): Promise<
    | (HunterAccountData & { key_tail: string; pool_status: string })
    | { keys: Array<{ tail: string; status: string; plan_name?: string | null; reset_date?: string | null; remaining?: number | null }>; total_remaining: number }
  > {
    if (this.isOfficial()) {
      throw officialAccountDisabledError();
    }
    if (this.keys.length === 0) {
      throw new HunterError(
        "HUNTER_NO_KEY",
        "未配置 Hunter API Key。请在设置 → 集成中填写 Hunter API Key（支持多个，逗号分隔）。"
      );
    }

    const reports = [];
    for (const key of this.keys) {
      const data = await this.fetchAccountData(key);
      const poolStatus = describeKeyPool(this.root, [key], this.now())[0]?.status ?? "ok";
      reports.push({
        tail: keyTail(key),
        status: data ? poolStatus : "invalid",
        plan_name: data?.plan_name ?? null,
        reset_date: data?.reset_date ?? null,
        remaining: data?.requests?.credits?.remaining ?? data?.requests?.searches?.remaining ?? null,
        data,
      });
    }

    if (reports.length === 1) {
      const only = reports[0]!;
      if (!only.data) {
        throw new HunterError(
          "HUNTER_UNAUTHORIZED",
          `Hunter API Key 无效（…${only.tail}）。请在设置 → 集成中检查或更换 Key。`,
          401
        );
      }
      return { ...only.data, key_tail: only.tail, pool_status: only.status };
    }

    return {
      keys: reports.map(({ data: _data, ...rest }) => rest),
      total_remaining: reports.reduce((sum, r) => sum + (r.remaining ?? 0), 0),
    };
  }
}
