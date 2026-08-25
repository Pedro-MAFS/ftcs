import { buildSearchDomainFilters, type TavilySearchResponse } from "./tavily.js";

export class GatewaySearchError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "GatewaySearchError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function getGatewayApiKey(): string {
  const apiKey = process.env.FTCS_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new GatewaySearchError(
      "GATEWAY_KEY_MISSING",
      "官方通道未配置网关 API Key（FTCS_GATEWAY_API_KEY）。请到设置页开通官方通道。",
      401
    );
  }
  return apiKey;
}

/** Base 须含 /v1；仅去尾 `/`，再拼 `/search`。 */
export function getGatewayBaseUrl(): string {
  const raw =
    process.env.FTCS_TOKEN_GATEWAY_BASE_URL?.trim() ||
    "https://token.ai-utills.com/v1";
  return raw.replace(/\/+$/, "");
}

function mapGatewayFailure(status: number, bodyText: string): GatewaySearchError {
  let reason = "";
  try {
    const json = JSON.parse(bodyText) as { reason?: string; message?: string; error?: string };
    reason = (json.reason || json.message || json.error || "").trim();
  } catch {
    reason = bodyText.trim().slice(0, 200);
  }

  if (status === 401) {
    return new GatewaySearchError(
      "GATEWAY_AUTH_FAILED",
      reason || "官方通道凭证无效或已失效，请到设置页重新开通官方通道。",
      401
    );
  }
  if (status === 402) {
    return new GatewaySearchError(
      "INSUFFICIENT_BALANCE",
      reason || "官方账户余额不足，请到设置页充值后再搜索。",
      402
    );
  }
  if (status >= 500) {
    return new GatewaySearchError(
      "GATEWAY_UPSTREAM_ERROR",
      reason || `搜索上游暂时不可用（HTTP ${status}），请稍后重试。`,
      status
    );
  }
  return new GatewaySearchError(
    "GATEWAY_SEARCH_FAILED",
    reason || `网关搜索失败（HTTP ${status}）`,
    status
  );
}

/**
 * 经 Token 网关搜索（US-FTCS-S01 / US-E-02）。
 * POST {base}/search，Bearer sk；勿传 api_key / num_results / include_answer。
 * 站点收窄与直连 Tavily 相同：R2 传 include_domains，R1 传 exclude_domains。
 */
export function buildGatewaySearchBody(
  query: string,
  numResults: number,
  language: string,
  includeDomains?: string[],
): Record<string, unknown> {
  return {
    query,
    max_results: Math.min(Math.max(numResults, 1), 10),
    search_depth: "basic",
    language: language || "en",
    ...buildSearchDomainFilters(includeDomains),
  };
}

export async function searchViaGateway(
  query: string,
  numResults: number,
  language: string,
  includeDomains?: string[],
): Promise<TavilySearchResponse> {
  const apiKey = getGatewayApiKey();
  const base = getGatewayBaseUrl();
  const url = `${base}/search`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildGatewaySearchBody(query, numResults, language, includeDomains)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw mapGatewayFailure(response.status, text);
  }

  const payload = (await response.json()) as {
    query?: string;
    results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  };

  return {
    query: payload.query || query,
    results: (payload.results || []).map((item) => ({
      title: item.title || "",
      url: item.url || "",
      content: item.content || "",
      score: item.score,
    })),
  };
}
