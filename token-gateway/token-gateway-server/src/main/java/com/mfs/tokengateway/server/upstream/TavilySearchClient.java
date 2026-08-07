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
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

/**
 * Tavily Search 出站客户端（US-G5-01）。
 */
@Component
public class TavilySearchClient {

    private static final Logger log = LoggerFactory.getLogger(TavilySearchClient.class);

    private final RestClient restClient;
    private final TokenGatewayProperties properties;

    public TavilySearchClient(
            @Qualifier("tavilyRestClient") RestClient tavilyRestClient,
            TokenGatewayProperties properties) {
        this.restClient = tavilyRestClient;
        this.properties = properties;
    }

    /**
     * @param outboundBody 网关已拼装的上游 body（含强制 include_* = false）
     */
    public UpstreamSearchResponse search(JsonNode outboundBody) {
        String apiKey = properties.getUpstream().getTavily().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw UpstreamException.notConfigured();
        }

        String url = TavilyEndpoints.searchUrl(properties);
        try {
            return restClient.post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + apiKey)
                    .body(outboundBody)
                    .exchange((request, response) -> {
                        byte[] bytes = response.getBody().readAllBytes();
                        String body = new String(bytes, StandardCharsets.UTF_8);
                        int code = response.getStatusCode().value();
                        if (response.getStatusCode().is2xxSuccessful()) {
                            if (body.isBlank()) {
                                throw UpstreamException.invalidResponse();
                            }
                            return new UpstreamSearchResponse(code, body);
                        }
                        log.warn("upstream search failed status={}", code);
                        throw UpstreamException.error();
                    });
        } catch (UpstreamException e) {
            throw e;
        } catch (ResourceAccessException e) {
            throw mapAccessException(e);
        } catch (Exception e) {
            if (e.getCause() instanceof UpstreamException ue) {
                throw ue;
            }
            log.warn("upstream search unexpected failure: {}", e.toString());
            throw UpstreamException.unreachable();
        }
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
