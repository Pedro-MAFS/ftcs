package com.mfs.tokengateway.server.upstream;

import com.mfs.tokengateway.server.config.TokenGatewayProperties;

/** Tavily Search URL 拼装（US-G5-01）。 */
public final class TavilyEndpoints {

    private TavilyEndpoints() {
    }

    public static String searchUrl(TokenGatewayProperties properties) {
        String base = properties.getUpstream().getTavily().getBaseUrl();
        if (base == null || base.isBlank()) {
            base = "https://api.tavily.com";
        }
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/search";
    }
}
