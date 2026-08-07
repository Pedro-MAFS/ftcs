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

class TavilySearchClientTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private HttpServer server;
    private TokenGatewayProperties properties;
    private TavilySearchClient client;
    private final AtomicInteger requestCount = new AtomicInteger();
    private final AtomicReference<String> lastAuth = new AtomicReference<>();
    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private int responseCode = 200;
    private String responseBody = "{\"results\":[]}";

    @BeforeEach
    void setUp() throws Exception {
        requestCount.set(0);
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/search", exchange -> {
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
        properties.getUpstream().getTavily().setApiKey("secret-tavily-key");
        properties.getUpstream().getTavily().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.getUpstream().getTavily().setConnectTimeout(Duration.ofSeconds(2));
        properties.getUpstream().getTavily().setReadTimeout(Duration.ofSeconds(5));

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(5));
        RestClient restClient = RestClient.builder().requestFactory(factory).build();
        client = new TavilySearchClient(restClient, properties);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void postsWithBearerAndNoApiKeyInBody() throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "hello");
        body.put("search_depth", "basic");
        body.put("max_results", 5);
        body.put("include_answer", false);
        body.put("include_raw_content", false);

        UpstreamSearchResponse resp = client.search(body);
        assertEquals(200, resp.statusCode());
        assertEquals("Bearer secret-tavily-key", lastAuth.get());
        assertFalse(lastBody.get().contains("api_key"));
        assertTrue(lastBody.get().contains("\"include_answer\":false"));
        assertEquals(1, requestCount.get());
    }

    @Test
    void mapsUpstream401ToUpstreamErrorWithoutLeakingKey() {
        responseCode = 401;
        responseBody = "{\"error\":\"bad key\"}";

        ObjectNode body = mapper.createObjectNode();
        body.put("query", "hello");

        UpstreamException ex = assertThrows(UpstreamException.class, () -> client.search(body));
        assertEquals("upstream_error", ex.getCode());
        assertFalse(ex.getMessage().contains("secret-tavily-key"));
    }

    @Test
    void rejectsMissingApiKeyWithoutCallingUpstream() {
        properties.getUpstream().getTavily().setApiKey("");
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "hello");

        UpstreamException ex = assertThrows(UpstreamException.class, () -> client.search(body));
        assertEquals("upstream_not_configured", ex.getCode());
        assertEquals(0, requestCount.get());
    }
}
