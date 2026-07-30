package com.mfs.tokengateway.server.application;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.upstream.DeepSeekChatClient;
import com.mfs.tokengateway.server.upstream.DeepSeekStreamClient;
import com.mfs.tokengateway.server.upstream.ModelWhitelist;
import com.mfs.tokengateway.server.upstream.SseEventPump;
import com.mfs.tokengateway.server.upstream.StreamFinishContext;
import com.mfs.tokengateway.server.upstream.StreamFinishListener;
import com.mfs.tokengateway.server.upstream.UpstreamChatResponse;
import com.mfs.tokengateway.server.upstream.UpstreamException;
import com.mfs.tokengateway.server.web.RequestIds;

/**
 * Chat 代理用例：非流式（US-G0-03）+ 流式 SSE（US-G0-04）。不含鉴权、扣费。
 */
@Service
public class ChatProxyApplication {

    private static final Logger log = LoggerFactory.getLogger(ChatProxyApplication.class);

    private final ModelWhitelist modelWhitelist;
    private final DeepSeekChatClient deepSeekChatClient;
    private final DeepSeekStreamClient deepSeekStreamClient;
    private final TokenGatewayProperties properties;
    private final ExecutorService streamExecutor;
    private final StreamFinishListener streamFinishListener;
    private final ObjectMapper objectMapper;

    public ChatProxyApplication(
            ModelWhitelist modelWhitelist,
            DeepSeekChatClient deepSeekChatClient,
            DeepSeekStreamClient deepSeekStreamClient,
            TokenGatewayProperties properties,
            @Qualifier("deepSeekStreamExecutor") ExecutorService streamExecutor,
            StreamFinishListener streamFinishListener,
            ObjectMapper objectMapper) {
        this.modelWhitelist = modelWhitelist;
        this.deepSeekChatClient = deepSeekChatClient;
        this.deepSeekStreamClient = deepSeekStreamClient;
        this.properties = properties;
        this.streamExecutor = streamExecutor;
        this.streamFinishListener = streamFinishListener;
        this.objectMapper = objectMapper;
    }

    public ResponseEntity<String> complete(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_json");
        }
        assertModelAllowed(body);

        try {
            UpstreamChatResponse upstream = deepSeekChatClient.postChat(body);
            return ResponseEntity.status(upstream.statusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(upstream.body());
        } catch (UpstreamException e) {
            throw new ResponseStatusException(e.getStatus(), e.getCode(), e);
        }
    }

    public SseEmitter completeStream(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_json");
        }
        assertModelAllowed(body);

        String apiKey = properties.getUpstream().getDeepseek().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "upstream_not_configured");
        }

        ObjectNode outbound = deepSeekStreamClient.prepareOutbound(body);
        long emitterMs = properties.getUpstream().getDeepseek().getStreamEmitterTimeout().toMillis();
        SseEmitter emitter = new SseEmitter(emitterMs);

        String requestId = currentRequestId();
        AtomicReference<JsonNode> lastUsage = new AtomicReference<>();
        AtomicBoolean cancelled = new AtomicBoolean(false);
        AtomicBoolean finishedNotified = new AtomicBoolean(false);
        AtomicReference<DeepSeekStreamClient.UpstreamSseConnection> connectionRef =
                new AtomicReference<>();

        Runnable cancelUpstream = () -> {
            cancelled.set(true);
            DeepSeekStreamClient.UpstreamSseConnection conn = connectionRef.get();
            if (conn != null) {
                conn.close();
            }
        };

        emitter.onTimeout(() -> {
            log.warn("chat stream emitter timeout requestId={}", requestId);
            cancelUpstream.run();
            notifyFinished(requestId, lastUsage.get(), true, finishedNotified);
        });
        emitter.onError(ex -> {
            cancelUpstream.run();
            notifyFinished(requestId, lastUsage.get(), true, finishedNotified);
        });
        emitter.onCompletion(() -> {
            // 正常 complete 也会触发；若泵送已 notify 则 no-op
            if (cancelled.get()) {
                notifyFinished(requestId, lastUsage.get(), true, finishedNotified);
            }
        });

        try {
            streamExecutor.execute(() -> pumpStream(
                    emitter, outbound, requestId, lastUsage, cancelled, finishedNotified, connectionRef));
        } catch (RejectedExecutionException e) {
            log.warn("chat stream pool rejected requestId={}", requestId);
            cancelUpstream.run();
            emitter.completeWithError(e);
            notifyFinished(requestId, null, true, finishedNotified);
        }

        return emitter;
    }

    private void pumpStream(
            SseEmitter emitter,
            ObjectNode outbound,
            String requestId,
            AtomicReference<JsonNode> lastUsage,
            AtomicBoolean cancelled,
            AtomicBoolean finishedNotified,
            AtomicReference<DeepSeekStreamClient.UpstreamSseConnection> connectionRef) {
        boolean interrupted = false;
        try {
            DeepSeekStreamClient.UpstreamSseConnection connection = deepSeekStreamClient.open(outbound);
            connectionRef.set(connection);
            try (connection;
                    BufferedReader reader = new BufferedReader(
                            new InputStreamReader(connection.body(), StandardCharsets.UTF_8))) {
                SseEventPump.pump(
                        reader,
                        data -> emitter.send(SseEmitter.event().data(data)),
                        cancelled::get,
                        objectMapper,
                        lastUsage);
            }
            if (cancelled.get()) {
                interrupted = true;
            }
            if (!interrupted) {
                try {
                    emitter.complete();
                } catch (Exception ignored) {
                    // already completed
                }
                notifyFinished(requestId, lastUsage.get(), false, finishedNotified);
            } else {
                notifyFinished(requestId, lastUsage.get(), true, finishedNotified);
            }
        } catch (UpstreamException e) {
            interrupted = cancelled.get();
            log.warn(
                    "chat stream upstream failed requestId={} code={} interrupted={}",
                    requestId,
                    e.getCode(),
                    interrupted);
            try {
                emitter.completeWithError(e);
            } catch (Exception ignored) {
                // ignore
            }
            notifyFinished(requestId, lastUsage.get(), interrupted || cancelled.get(), finishedNotified);
        } catch (Exception e) {
            interrupted = cancelled.get();
            log.warn(
                    "chat stream pump failed requestId={} interrupted={}: {}",
                    requestId,
                    interrupted,
                    e.toString());
            try {
                emitter.completeWithError(e);
            } catch (Exception ignored) {
                // ignore
            }
            notifyFinished(requestId, lastUsage.get(), true, finishedNotified);
        }
    }

    private void notifyFinished(
            String requestId,
            JsonNode usage,
            boolean interrupted,
            AtomicBoolean finishedNotified) {
        if (!finishedNotified.compareAndSet(false, true)) {
            return;
        }
        try {
            streamFinishListener.onFinished(new StreamFinishContext(requestId, usage, interrupted));
        } catch (Exception e) {
            log.warn("stream finish listener failed requestId={}: {}", requestId, e.toString());
        }
    }

    private static String currentRequestId() {
        String fromMdc = MDC.get(RequestIds.MDC_KEY);
        if (fromMdc != null && !fromMdc.isBlank()) {
            return fromMdc;
        }
        return RequestIds.newId();
    }

    private void assertModelAllowed(JsonNode body) {
        JsonNode modelNode = body.get("model");
        if (modelNode == null || modelNode.isNull() || !modelNode.isTextual() || modelNode.asText().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "model_required");
        }
        String model = modelNode.asText();
        if (!modelWhitelist.isAllowed(model)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "model_not_allowed");
        }
    }
}
