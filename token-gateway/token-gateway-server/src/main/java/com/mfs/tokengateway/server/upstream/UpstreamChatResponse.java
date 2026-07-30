package com.mfs.tokengateway.server.upstream;

/**
 * 上游成功响应（状态码 + JSON 正文）。
 */
public record UpstreamChatResponse(int statusCode, String body) {
}
