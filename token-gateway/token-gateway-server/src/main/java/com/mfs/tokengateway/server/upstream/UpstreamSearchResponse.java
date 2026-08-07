package com.mfs.tokengateway.server.upstream;

/**
 * Tavily 上游成功响应（原始 JSON 字符串，由 Application 投影为对外 DTO）。
 */
public record UpstreamSearchResponse(int statusCode, String body) {
}
