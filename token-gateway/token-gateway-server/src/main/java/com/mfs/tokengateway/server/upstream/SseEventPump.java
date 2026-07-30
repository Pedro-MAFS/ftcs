package com.mfs.tokengateway.server.upstream;

import java.io.BufferedReader;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 解析上游 SSE 行并回调 data 载荷（US-G0-04）。
 */
public final class SseEventPump {

    @FunctionalInterface
    public interface DataHandler {
        void onData(String dataPayload) throws IOException;
    }

    private SseEventPump() {
    }

    /**
     * @return 是否读到 {@code [DONE]}
     */
    public static boolean pump(
            BufferedReader reader,
            DataHandler handler,
            BooleanSupplier cancelled,
            ObjectMapper objectMapper,
            AtomicReference<JsonNode> lastUsage)
            throws IOException {
        String line;
        boolean sawDone = false;
        while ((line = reader.readLine()) != null) {
            if (cancelled.getAsBoolean()) {
                break;
            }
            if (line.isEmpty() || !line.startsWith("data:")) {
                continue;
            }
            String data = line.substring(5);
            if (data.startsWith(" ")) {
                data = data.substring(1);
            }
            if (data.isEmpty()) {
                continue;
            }
            if ("[DONE]".equals(data)) {
                handler.onData("[DONE]");
                sawDone = true;
                break;
            }
            captureUsage(data, objectMapper, lastUsage);
            handler.onData(data);
        }
        return sawDone;
    }

    private static void captureUsage(
            String dataJson, ObjectMapper objectMapper, AtomicReference<JsonNode> lastUsage) {
        try {
            JsonNode node = objectMapper.readTree(dataJson);
            JsonNode usage = node.get("usage");
            if (usage != null && !usage.isNull()) {
                lastUsage.set(usage);
            }
        } catch (Exception ignored) {
            // ignore non-json
        }
    }
}
