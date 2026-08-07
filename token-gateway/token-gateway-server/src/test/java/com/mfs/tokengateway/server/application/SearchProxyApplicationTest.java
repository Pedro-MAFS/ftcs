package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.metering.RequestMeterCommand;
import com.mfs.tokengateway.server.metering.RequestMeterService;
import com.mfs.tokengateway.server.metering.SearchBilling;
import com.mfs.tokengateway.server.security.ChatCaller;
import com.mfs.tokengateway.server.upstream.TavilySearchClient;
import com.mfs.tokengateway.server.upstream.UpstreamException;
import com.mfs.tokengateway.server.upstream.UpstreamSearchResponse;

@ExtendWith(MockitoExtension.class)
class SearchProxyApplicationTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Mock
    private TavilySearchClient tavilySearchClient;

    @Mock
    private RequestMeterService requestMeterService;

    private SearchProxyApplication application;
    private ChatCaller caller;

    @BeforeEach
    void setUp() {
        application = new SearchProxyApplication(tavilySearchClient, mapper, requestMeterService);
        caller = new ChatCaller(9L, 1L, "ftcs-desktop", "t", "u");
        MockHttpServletRequest request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        RequestContextHolder.getRequestAttributes()
                .setAttribute(ChatCaller.REQUEST_ATTR, caller, RequestAttributes.SCOPE_REQUEST);
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void proxiesAllowedRequestAndMetersPendingWithoutQuery() throws Exception {
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
        assertFalse(out.has("answer"));

        ArgumentCaptor<RequestMeterCommand> meterCaptor = ArgumentCaptor.forClass(RequestMeterCommand.class);
        verify(requestMeterService).record(meterCaptor.capture());
        RequestMeterCommand cmd = meterCaptor.getValue();
        assertEquals(SearchBilling.MODEL, cmd.model());
        assertEquals(RequestMeterService.STATUS_SUCCESS, cmd.status());
        assertEquals(caller, cmd.caller());
        assertEquals(1, cmd.usage().get("prompt_tokens").asInt());
        assertEquals(0, cmd.usage().get("completion_tokens").asInt());
        assertEquals("depth=basic;results=1", cmd.errorSummary());
        assertFalse(cmd.errorSummary().contains("valve"));
    }

    @Test
    void emptyResultsStillMetersPending() throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(tavilySearchClient.search(any()))
                .thenReturn(new UpstreamSearchResponse(200, "{\"results\":[]}"));

        ResponseEntity<String> resp = application.search(body);
        assertEquals(200, resp.getStatusCode().value());

        ArgumentCaptor<RequestMeterCommand> meterCaptor = ArgumentCaptor.forClass(RequestMeterCommand.class);
        verify(requestMeterService).record(meterCaptor.capture());
        assertEquals(RequestMeterService.STATUS_SUCCESS, meterCaptor.getValue().status());
        assertEquals("depth=basic;results=0", meterCaptor.getValue().errorSummary());
        assertTrue(meterCaptor.getValue().usage() != null);
    }

    @Test
    void upstreamErrorMetersPendingAndParticipatesInSettlement() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(tavilySearchClient.search(any())).thenThrow(UpstreamException.error());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertEquals("upstream_error", ex.getReason());

        ArgumentCaptor<RequestMeterCommand> meterCaptor = ArgumentCaptor.forClass(RequestMeterCommand.class);
        verify(requestMeterService).record(meterCaptor.capture());
        RequestMeterCommand cmd = meterCaptor.getValue();
        assertEquals(RequestMeterService.STATUS_ERROR, cmd.status());
        assertEquals(SearchBilling.MODEL, cmd.model());
        assertEquals(1, cmd.usage().get("prompt_tokens").asInt());
        assertEquals(0, cmd.usage().get("completion_tokens").asInt());
        assertEquals("depth=basic;code=upstream_error", cmd.errorSummary());
    }

    @Test
    void rejectsMissingQueryWithoutUpstreamOrMeter() {
        ObjectNode body = mapper.createObjectNode();
        body.put("max_results", 5);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("query_required", ex.getReason());
        verify(tavilySearchClient, never()).search(any());
        verify(requestMeterService, never()).record(any());
    }

    @Test
    void rejectsBlankQuery() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "   ");

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("query_required", ex.getReason());
        verify(requestMeterService, never()).record(any());
    }

    @Test
    void rejectsQueryTooLong() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "a".repeat(401));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("query_too_long", ex.getReason());
        verify(requestMeterService, never()).record(any());
    }

    @Test
    void rejectsInvalidMaxResults() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        body.put("max_results", 11);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("max_results_invalid", ex.getReason());
        verify(requestMeterService, never()).record(any());
    }

    @Test
    void rejectsAdvancedSearchDepth() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        body.put("search_depth", "advanced");

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("search_depth_not_allowed", ex.getReason());
        verify(requestMeterService, never()).record(any());
    }

    @Test
    void rejectsDisallowedFields() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        body.put("include_answer", true);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("field_not_allowed", ex.getReason());
        verify(requestMeterService, never()).record(any());
    }

    @Test
    void rejectsNumResultsAlias() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        body.put("num_results", 5);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals("field_not_allowed", ex.getReason());
        verify(requestMeterService, never()).record(any());
    }

    @Test
    void mapsMissingUpstreamKeyTo503AndMetersError() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(tavilySearchClient.search(any())).thenThrow(UpstreamException.notConfigured());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.search(body));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertEquals("upstream_not_configured", ex.getReason());
        verify(requestMeterService).record(any());
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
        verify(requestMeterService, never()).record(any());
    }

    @Test
    void withoutCallerStillReturnsSearchAndPassesNullCallerToMeter() throws Exception {
        RequestContextHolder.resetRequestAttributes();
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(tavilySearchClient.search(any()))
                .thenReturn(new UpstreamSearchResponse(200, "{\"results\":[]}"));

        ResponseEntity<String> resp = application.search(body);
        assertEquals(200, resp.getStatusCode().value());

        ArgumentCaptor<RequestMeterCommand> meterCaptor = ArgumentCaptor.forClass(RequestMeterCommand.class);
        verify(requestMeterService).record(meterCaptor.capture());
        assertNull(meterCaptor.getValue().caller());
    }
}
