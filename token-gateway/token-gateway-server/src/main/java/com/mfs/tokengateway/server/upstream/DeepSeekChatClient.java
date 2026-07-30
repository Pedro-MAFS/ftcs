package com.mfs.tokengateway.server.upstream;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

/**
 * DeepSeek Chat Completions 出站客户端（US-G0-03）。
 */
@Component
public class DeepSeekChatClient {

    private static final Logger log = LoggerFactory.getLogger(DeepSeekChatClient.class);

    private final RestClient restClient;
    private final TokenGatewayProperties properties;

    public DeepSeekChatClient(
            @Qualifier("deepSeekRestClient") RestClient deepSeekRestClient,
            TokenGatewayProperties properties) {
        this.restClient = deepSeekRestClient;
        this.properties = properties;
    }

    public UpstreamChatResponse postChat(JsonNode requestBody) {
        String apiKey = properties.getUpstream().getDeepseek().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw UpstreamException.notConfigured();
        }

        ObjectNode outbound = requestBody.deepCopy();
        outbound.put("stream", false);

        String url = chatCompletionsUrl();
        try {
            return restClient.post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + apiKey)
                    .body(outbound)
                    .exchange((request, response) -> {
                        byte[] bytes = response.getBody().readAllBytes();
                        String body = new String(bytes, StandardCharsets.UTF_8);
                        int code = response.getStatusCode().value();
                        if (response.getStatusCode().is2xxSuccessful()) {
                            if (body.isBlank()) {
                                throw UpstreamException.invalidResponse();
                            }
                            return new UpstreamChatResponse(code, body);
                        }
                        log.warn("upstream chat failed status={}", code);
                        throw mapHttpError(code);
                    });
        } catch (UpstreamException e) {
            throw e;
        } catch (ResourceAccessException e) {
            throw mapAccessException(e);
        } catch (Exception e) {
            if (e.getCause() instanceof UpstreamException ue) {
                throw ue;
            }
            log.warn("upstream chat unexpected failure: {}", e.toString());
            throw UpstreamException.unreachable();
        }
    }

    String chatCompletionsUrl() {
        String base = properties.getUpstream().getDeepseek().getBaseUrl();
        if (base == null || base.isBlank()) {
            base = "https://api.deepseek.com";
        }
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/chat/completions";
    }

    private static UpstreamException mapHttpError(int code) {
        // 上游 401（Key 无效）对客户端一律 502，避免与网关 sk 401 混淆
        if (code == 401 || code >= 500) {
            return UpstreamException.error();
        }
        if (code == 429 || code == 400 || code == 403 || code == 404) {
            return UpstreamException.error();
        }
        return UpstreamException.error();
    }

    private static UpstreamException mapAccessException(ResourceAccessException e) {
        Throwable cause = e.getCause();
        if (cause instanceof SocketTimeoutException
                || (cause instanceof IOException && cause.getMessage() != null
                        && cause.getMessage().toLowerCase().contains("timed out"))) {
            return UpstreamException.timeout();
        }
        return UpstreamException.unreachable();
    }
}
