package com.mfs.tokengateway.server.upstream;

import com.fasterxml.jackson.databind.JsonNode;
import com.mfs.tokengateway.server.security.ChatCaller;

/**
 * 流式结束上下文（US-G0-04 / G0-09 计量）。
 */
public record StreamFinishContext(
        String requestId,
        JsonNode usage,
        boolean interrupted,
        ChatCaller caller,
        String model,
        Integer latencyMs,
        Integer upstreamStatus,
        String errorSummary) {

    public boolean hasUsage() {
        return usage != null && !usage.isNull() && !usage.isMissingNode();
    }
}
