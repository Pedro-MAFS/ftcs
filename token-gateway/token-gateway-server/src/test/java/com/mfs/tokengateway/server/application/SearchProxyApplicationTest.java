package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.upstream.TavilySearchClient;
import com.mfs.tokengateway.server.upstream.UpstreamException;
import com.mfs.tokengateway.server.upstream.UpstreamSearchResponse;

@ExtendWith(MockitoExtension.class)
class SearchProxyApplicationTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Mock
    private TavilySearchClient tavilySearchClient;

    private SearchProxyApplication application;

    @BeforeEach
    void setUp() {
        application = new SearchProxyApplication(tavilySearchClient, mapper);
    }

    @Test
    void proxiesAllowedRequestAndStripsAnswer() throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "  valve distributors  ");
        body.put("max_results", 3);
        body.put("language", "en");

        when(tavilySearchClient.search(any()))
                .thenReturn(new UpstreamSearchResponse(
                        200,
                        """
                        {
                          "answer": "secret",
                          "results": [
                            {"title": "Acme", "url": "https://acme.example", "content": "snippet", "score": 0.9}
                          ]
                        }
                        """));

        ResponseEntity<String> resp = application.search(body);
        assertEquals(200, resp.getStatusCode().value());
        JsonNode out = mapper.readTree(resp.getBody());
        assertEquals("valve distributors", out.get("query").asText());
        assertEquals("en", out.get("language").asText());
        assertEquals("basic", out.get("search_depth").asText());
        assertEquals(3, out.get("max_results").asInt());
        assertEquals(1, out.get("results").size());
        assertEquals("Acme", out.get("results").get(0).get("title").asText());
        assertEquals(0.9, out.get("results").get(0).get("score").asDouble(), 1e-9);
        assertFalse(out.has("answer"));

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(tavilySearchClient).search(captor.capture());
        JsonNode outbound = captor.getValue();
        assertEquals("valve distributors", outbound.get("query").asText());
        assertEquals(false, outbound.get("include_answer").asBoolean());
        assertEquals(false, outbound.get("include_raw_content").asBoolean());
        assertEquals("basic", outbound.get("search_depth").asText());
        assertEquals(3, outbound.get("max_results").asInt());
    }

    @Test
    void rejectsMissingQueryWithoutUpstream() {
        ObjectNode body = mapper.createObjectNode();
        body.put("max_results", 5);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("query_required", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
    }

    @Test
    void rejectsBlankQuery() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "   ");

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("query_required", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
    }

    @Test
    void rejectsQueryTooLong() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "a".repeat(401));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("query_too_long", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
    }

    @Test
    void rejectsInvalidMaxResults() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        body.put("max_results", 11);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("max_results_invalid", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
    }

    @Test
    void rejectsAdvancedSearchDepth() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        body.put("search_depth", "advanced");

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("search_depth_not_allowed", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
    }

    @Test
    void rejectsDisallowedFields() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        body.put("include_answer", true);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("field_not_allowed", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
    }

    @Test
    void rejectsNumResultsAlias() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        body.put("num_results", 5);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("field_not_allowed", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
    }

    @Test
    void mapsMissingUpstreamKeyTo503() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(tavilySearchClient.search(any())).thenThrow(UpstreamException.notConfigured());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertEquals("upstream_not_configured", ex.getReason());
    }

    @Test
    void mapsUpstreamUnauthorizedTo502() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(tavilySearchClient.search(any())).thenThrow(UpstreamException.error());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertEquals("upstream_error", ex.getReason());
    }

    @Test
    void mapsUpstreamTimeoutTo504() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(tavilySearchClient.search(any())).thenThrow(UpstreamException.timeout());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals(HttpStatus.GATEWAY_TIMEOUT, ex.getStatusCode());
        assertEquals("upstream_timeout", ex.getReason());
    }

    @Test
    void emptyResultsStill200() throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(tavilySearchClient.search(any()))
                .thenReturn(new UpstreamSearchResponse(200, "{\"results\":[]}"));

        ResponseEntity<String> resp = application.search(body);
        assertEquals(200, resp.getStatusCode().value());
        assertTrue(mapper.readTree(resp.getBody()).get("results").isEmpty());
    }

    @Test
    void rejectsInvalidJsonBody() {
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(null));
        assertEquals("invalid_json", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
    }
}
