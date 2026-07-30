package com.mfs.tokengateway.server.upstream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.sun.net.httpserver.HttpServer;

class DeepSeekStreamClientSseTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private HttpServer server;
    private TokenGatewayProperties properties;
    private DeepSeekStreamClient client;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            String sse = ""
                    + "data: {\"id\":\"1\",\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n"
                    + "data: {\"id\":\"1\",\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1,"
                    + "\"total_tokens\":2},\"choices\":[]}\n\n"
                    + "data: [DONE]\n\n";
            byte[] bytes = sse.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        server.start();

        properties = new TokenGatewayProperties();
        properties.getUpstream().getDeepseek().setApiKey("test-key");
        properties.getUpstream().getDeepseek().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.getUpstream().getDeepseek().setConnectTimeout(Duration.ofSeconds(2));
        properties.getUpstream().getDeepseek().setStreamReadTimeout(Duration.ofSeconds(10));
        client = new DeepSeekStreamClient(java.net.http.HttpClient.newHttpClient(), properties, mapper);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void openAndPumpParsesUsageAndDone() throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");
        ObjectNode outbound = client.prepareOutbound(body);

        List<String> events = new ArrayList<>();
        AtomicReference<JsonNode> usage = new AtomicReference<>();
        try (DeepSeekStreamClient.UpstreamSseConnection conn = client.open(outbound);
                BufferedReader reader = new BufferedReader(
                        new java.io.InputStreamReader(conn.body(), StandardCharsets.UTF_8))) {
            boolean done = SseEventPump.pump(
                    reader, events::add, () -> false, mapper, usage);
            assertTrue(done);
        }

        assertEquals(3, events.size());
        assertEquals("[DONE]", events.get(2));
        assertTrue(events.get(0).contains("Hi"));
        assertNotNullUsage(usage.get());
        assertEquals(2, usage.get().get("total_tokens").asInt());
    }

    @Test
    void pumpStopsOnCancel() throws Exception {
        String raw = ""
                + "data: {\"a\":1}\n\n"
                + "data: {\"a\":2}\n\n"
                + "data: [DONE]\n\n";
        AtomicBoolean cancelled = new AtomicBoolean(false);
        List<String> events = new ArrayList<>();
        AtomicReference<JsonNode> usage = new AtomicReference<>();
        boolean done = SseEventPump.pump(
                new BufferedReader(new StringReader(raw)),
                data -> {
                    events.add(data);
                    if (events.size() == 1) {
                        cancelled.set(true);
                    }
                },
                cancelled::get,
                mapper,
                usage);
        assertFalse(done);
        assertEquals(1, events.size());
    }

    private static void assertNotNullUsage(JsonNode usage) {
        org.junit.jupiter.api.Assertions.assertNotNull(usage);
    }
}
