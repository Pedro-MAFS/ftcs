package com.mfs.tokengateway.server.upstream;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

/**
 * DeepSeek 流式 Chat 出站（US-G0-04）：HttpClient 读 SSE，不整包缓冲。
 */
@Component
public class DeepSeekStreamClient {

    private static final Logger log = LoggerFactory.getLogger(DeepSeekStreamClient.class);

    private final HttpClient httpClient;
    private final TokenGatewayProperties properties;
    private final ObjectMapper objectMapper;

    public DeepSeekStreamClient(
            @Qualifier("deepSeekHttpClient") HttpClient deepSeekHttpClient,
            TokenGatewayProperties properties,
            ObjectMapper objectMapper) {
        this.httpClient = deepSeekHttpClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /** 出站 body：强制 stream=true，并强制 stream_options.include_usage=true。 */
    public ObjectNode prepareOutbound(JsonNode requestBody) {
        ObjectNode outbound = requestBody.deepCopy();
        outbound.put("stream", true);
        ObjectNode streamOptions;
        JsonNode existing = outbound.get("stream_options");
        if (existing != null && existing.isObject()) {
            streamOptions = (ObjectNode) existing;
        } else {
            streamOptions = outbound.putObject("stream_options");
        }
        streamOptions.put("include_usage", true);
        return outbound;
    }

    public UpstreamSseConnection open(JsonNode outboundBody) throws UpstreamException {
        String apiKey = properties.getUpstream().getDeepseek().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw UpstreamException.notConfigured();
        }

        String json;
        try {
            json = objectMapper.writeValueAsString(outboundBody);
        } catch (Exception e) {
            throw UpstreamException.invalidResponse();
        }

        Duration streamTimeout = properties.getUpstream().getDeepseek().getStreamReadTimeout();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(DeepSeekEndpoints.chatCompletionsUrl(properties)))
                .timeout(streamTimeout)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                .build();

        try {
            HttpResponse<InputStream> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            int code = response.statusCode();
            if (code < 200 || code >= 300) {
                try (InputStream err = response.body()) {
                    err.readAllBytes();
                } catch (Exception ignored) {
                    // ignore drain errors
                }
                log.warn("upstream stream chat failed status={}", code);
                throw UpstreamException.error();
            }
            return new UpstreamSseConnection(response.body());
        } catch (UpstreamException e) {
            throw e;
        } catch (java.net.http.HttpTimeoutException e) {
            throw UpstreamException.timeout();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw UpstreamException.unreachable();
        } catch (IOException e) {
            log.warn("upstream stream unreachable: {}", e.toString());
            throw UpstreamException.unreachable();
        }
    }

    /** 可关闭的上游 SSE 响应体。 */
    public static final class UpstreamSseConnection implements Closeable {

        private final InputStream body;

        UpstreamSseConnection(InputStream body) {
            this.body = body;
        }

        public InputStream body() {
            return body;
        }

        @Override
        public void close() {
            try {
                body.close();
            } catch (IOException ignored) {
                // ignore
            }
        }
    }
}
