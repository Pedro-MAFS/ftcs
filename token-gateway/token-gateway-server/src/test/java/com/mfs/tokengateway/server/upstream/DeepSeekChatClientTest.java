package com.mfs.tokengateway.server.upstream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.sun.net.httpserver.HttpServer;

class DeepSeekChatClientTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private HttpServer server;
    private TokenGatewayProperties properties;
    private DeepSeekChatClient client;
    private final AtomicInteger requestCount = new AtomicInteger();
    private final AtomicReference<String> lastAuth = new AtomicReference<>();
    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private int responseCode = 200;
    private String responseBody = "{\"id\":\"chatcmpl-1\",\"choices\":[]}";

    @BeforeEach
    void setUp() throws Exception {
        requestCount.set(0);
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            requestCount.incrementAndGet();
            lastAuth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            lastBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseCode, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        server.start();

        properties = new TokenGatewayProperties();
        properties.getUpstream().getDeepseek().setApiKey("secret-upstream-key");
        properties.getUpstream().getDeepseek().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.getUpstream().getDeepseek().setConnectTimeout(Duration.ofSeconds(2));
        properties.getUpstream().getDeepseek().setReadTimeout(Duration.ofSeconds(5));

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(5));
        RestClient restClient = RestClient.builder().requestFactory(factory).build();
        client = new DeepSeekChatClient(restClient, properties);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void postsWithBearerAndForcesStreamFalse() throws Exception {
        responseCode = 200;
        responseBody = "{\"id\":\"chatcmpl-1\",\"choices\":[]}";

        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");
        body.put("stream", true);

        UpstreamChatResponse resp = client.postChat(body);
        assertEquals(200, resp.statusCode());
        assertTrue(resp.body().contains("chatcmpl-1"));
        assertEquals("Bearer secret-upstream-key", lastAuth.get());
        assertTrue(lastBody.get().contains("\"stream\":false"));
        assertFalse(lastBody.get().contains("\"stream\":true"));
    }

    @Test
    void mapsUpstream401ToUpstreamErrorWithoutLeakingKey() {
        responseCode = 401;
        responseBody = "{\"error\":\"bad key\"}";

        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");

        UpstreamException ex = assertThrows(UpstreamException.class, () -> client.postChat(body));
        assertEquals("upstream_error", ex.getCode());
        assertFalse(ex.getMessage().contains("secret-upstream-key"));
    }

    @Test
    void rejectsMissingApiKeyWithoutCallingUpstream() {
        properties.getUpstream().getDeepseek().setApiKey("");
        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");

        UpstreamException ex = assertThrows(UpstreamException.class, () -> client.postChat(body));
        assertEquals("upstream_not_configured", ex.getCode());
        assertEquals(0, requestCount.get());
    }
}
