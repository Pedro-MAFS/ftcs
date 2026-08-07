package com.mfs.tokengateway.server.upstream;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import com.mfs.tokengateway.server.config.TokenGatewayProperties;

class TavilyEndpointsTest {

    @Test
    void joinsBaseUrlWithoutTrailingSlash() {
        TokenGatewayProperties properties = new TokenGatewayProperties();
        properties.getUpstream().getTavily().setBaseUrl("https://api.tavily.com/");
        assertEquals("https://api.tavily.com/search", TavilyEndpoints.searchUrl(properties));
    }
}
