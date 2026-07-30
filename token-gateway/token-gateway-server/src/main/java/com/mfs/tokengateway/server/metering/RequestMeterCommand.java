package com.mfs.tokengateway.server.metering;

import com.fasterxml.jackson.databind.JsonNode;
import com.mfs.tokengateway.server.security.ChatCaller;

/**
 * 一次请求计量落库命令（US-G0-09）；金额字段由服务强制置空。
 */
public record RequestMeterCommand(
        String requestId,
        ChatCaller caller,
        String model,
        String status,
        JsonNode usage,
        Integer latencyMs,
        Integer upstreamStatus,
        String errorSummary) {
}
