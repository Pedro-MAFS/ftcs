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
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.metering.RequestMeterCommand;
import com.mfs.tokengateway.server.metering.RequestMeterService;
import com.mfs.tokengateway.server.security.ChatCaller;
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
 * Chat 代理：非流式（G0-03）+ 流式 SSE（G0-04）+ 请求计量落库（G0-09，不算价不扣费）。
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
    private final RequestMeterService requestMeterService;
    private final ObjectMapper objectMapper;

    public ChatProxyApplication(
            ModelWhitelist modelWhitelist,
            DeepSeekChatClient deepSeekChatClient,
            DeepSeekStreamClient deepSeekStreamClient,
            TokenGatewayProperties properties,
            @Qualifier("deepSeekStreamExecutor") ExecutorService streamExecutor,
            StreamFinishListener streamFinishListener,
            RequestMeterService requestMeterService,
            ObjectMapper objectMapper) {
        this.modelWhitelist = modelWhitelist;
        this.deepSeekChatClient = deepSeekChatClient;
        this.deepSeekStreamClient = deepSeekStreamClient;
        this.properties = properties;
        this.streamExecutor = streamExecutor;
        this.streamFinishListener = streamFinishListener;
        this.requestMeterService = requestMeterService;
        this.objectMapper = objectMapper;
    }

    public ResponseEntity<String> complete(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_json");
        }
        assertModelAllowed(body);

        String model = body.get("model").asText();
        ChatCaller caller = currentCaller();
        String requestId = currentRequestId();
        long startedNs = System.nanoTime();

        try {
            UpstreamChatResponse upstream = deepSeekChatClient.postChat(body);
            JsonNode usage = extractUsageFromBody(upstream.body());
            meterNonStream(
                    requestId,
                    caller,
                    model,
                    RequestMeterService.STATUS_SUCCESS,
                    usage,
                    latencyMs(startedNs),
                    upstream.statusCode(),
                    null);
            return ResponseEntity.status(upstream.statusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(upstream.body());
        } catch (UpstreamException e) {
            meterNonStream(
                    requestId,
                    caller,
                    model,
                    RequestMeterService.STATUS_ERROR,
                    null,
                    latencyMs(startedNs),
                    e.getStatus() != null ? e.getStatus().value() : null,
                    e.getCode());
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

        String model = body.get("model").asText();
        ChatCaller caller = currentCaller();
        ObjectNode outbound = deepSeekStreamClient.prepareOutbound(body);
        long emitterMs = properties.getUpstream().getDeepseek().getStreamEmitterTimeout().toMillis();
        SseEmitter emitter = new SseEmitter(emitterMs);

        String requestId = currentRequestId();
        long startedNs = System.nanoTime();
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
            notifyFinished(
                    requestId,
                    lastUsage.get(),
                    true,
                    finishedNotified,
                    caller,
                    model,
                    latencyMs(startedNs),
                    null,
                    "emitter_timeout");
        });
        emitter.onError(ex -> {
            cancelUpstream.run();
            notifyFinished(
                    requestId,
                    lastUsage.get(),
                    true,
                    finishedNotified,
                    caller,
                    model,
                    latencyMs(startedNs),
                    null,
                    ex != null ? ex.getClass().getSimpleName() : "emitter_error");
        });
        emitter.onCompletion(() -> {
            if (cancelled.get()) {
                notifyFinished(
                        requestId,
                        lastUsage.get(),
                        true,
                        finishedNotified,
                        caller,
                        model,
                        latencyMs(startedNs),
                        null,
                        null);
            }
        });

        try {
            streamExecutor.execute(() -> pumpStream(
                    emitter,
                    outbound,
                    requestId,
                    lastUsage,
                    cancelled,
                    finishedNotified,
                    connectionRef,
                    caller,
                    model,
                    startedNs));
        } catch (RejectedExecutionException e) {
            log.warn("chat stream pool rejected requestId={}", requestId);
            cancelUpstream.run();
            emitter.completeWithError(e);
            notifyFinished(
                    requestId,
                    null,
                    true,
                    finishedNotified,
                    caller,
                    model,
                    latencyMs(startedNs),
                    null,
                    "pool_rejected");
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
            AtomicReference<DeepSeekStreamClient.UpstreamSseConnection> connectionRef,
            ChatCaller caller,
            String model,
            long startedNs) {
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
                notifyFinished(
                        requestId,
                        lastUsage.get(),
                        false,
                        finishedNotified,
                        caller,
                        model,
                        latencyMs(startedNs),
                        200,
                        null);
            } else {
                notifyFinished(
                        requestId,
                        lastUsage.get(),
                        true,
                        finishedNotified,
                        caller,
                        model,
                        latencyMs(startedNs),
                        200,
                        null);
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
            notifyFinished(
                    requestId,
                    lastUsage.get(),
                    interrupted || cancelled.get(),
                    finishedNotified,
                    caller,
                    model,
                    latencyMs(startedNs),
                    e.getStatus() != null ? e.getStatus().value() : null,
                    e.getCode());
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
            notifyFinished(
                    requestId,
                    lastUsage.get(),
                    true,
                    finishedNotified,
                    caller,
                    model,
                    latencyMs(startedNs),
                    null,
                    e.getClass().getSimpleName());
        }
    }

    private void notifyFinished(
            String requestId,
            JsonNode usage,
            boolean interrupted,
            AtomicBoolean finishedNotified,
            ChatCaller caller,
            String model,
            Integer latencyMs,
            Integer upstreamStatus,
            String errorSummary) {
        if (!finishedNotified.compareAndSet(false, true)) {
            return;
        }
        try {
            streamFinishListener.onFinished(new StreamFinishContext(
                    requestId,
                    usage,
                    interrupted,
                    caller,
                    model,
                    latencyMs,
                    upstreamStatus,
                    errorSummary));
        } catch (Exception e) {
            log.warn("stream finish listener failed requestId={}: {}", requestId, e.toString());
        }
    }

    private void meterNonStream(
            String requestId,
            ChatCaller caller,
            String model,
            String status,
            JsonNode usage,
            Integer latencyMs,
            Integer upstreamStatus,
            String errorSummary) {
        try {
            requestMeterService.record(new RequestMeterCommand(
                    requestId, caller, model, status, usage, latencyMs, upstreamStatus, errorSummary));
        } catch (Exception e) {
            log.warn("non-stream meter failed requestId={}: {}", requestId, e.toString());
        }
    }

    private JsonNode extractUsageFromBody(String body) {
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode usage = root.get("usage");
            if (usage == null || usage.isNull() || usage.isMissingNode()) {
                return null;
            }
            return usage;
        } catch (Exception e) {
            log.warn("failed to parse upstream usage JSON: {}", e.toString());
            return null;
        }
    }

    private static int latencyMs(long startedNs) {
        return (int) Math.min(Integer.MAX_VALUE, (System.nanoTime() - startedNs) / 1_000_000L);
    }

    private static ChatCaller currentCaller() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return null;
        }
        Object value = attrs.getAttribute(ChatCaller.REQUEST_ATTR, RequestAttributes.SCOPE_REQUEST);
        return value instanceof ChatCaller caller ? caller : null;
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
