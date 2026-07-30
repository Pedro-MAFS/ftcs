package com.mfs.tokengateway.server.upstream;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 流式结束上下文（US-G0-04）；G0-10 据此扣费或标记 skipped_no_usage。
 */
public record StreamFinishContext(String requestId, JsonNode usage, boolean interrupted) {

    public boolean hasUsage() {
        return usage != null && !usage.isNull() && !usage.isMissingNode();
    }
}
