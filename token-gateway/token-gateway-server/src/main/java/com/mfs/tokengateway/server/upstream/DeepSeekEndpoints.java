package com.mfs.tokengateway.server.upstream;

import com.mfs.tokengateway.server.config.TokenGatewayProperties;

/** DeepSeek Chat Completions URL 拼装（非流式 / 流式共用）。 */
public final class DeepSeekEndpoints {

    private DeepSeekEndpoints() {
    }

    public static String chatCompletionsUrl(TokenGatewayProperties properties) {
        String base = properties.getUpstream().getDeepseek().getBaseUrl();
        if (base == null || base.isBlank()) {
            base = "https://api.deepseek.com";
        }
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/chat/completions";
    }
}
