package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.upstream.DeepSeekChatClient;
import com.mfs.tokengateway.server.upstream.ModelWhitelist;
import com.mfs.tokengateway.server.upstream.UpstreamChatResponse;
import com.mfs.tokengateway.server.upstream.UpstreamException;

@ExtendWith(MockitoExtension.class)
class ChatProxyApplicationTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ModelWhitelist whitelist =
            new ModelWhitelist(Set.of("deepseek-v4-flash", "deepseek-v4-pro"));

    @Mock
    private DeepSeekChatClient deepSeekChatClient;

    private ChatProxyApplication application;

    @BeforeEach
    void setUp() {
        application = new ChatProxyApplication(whitelist, deepSeekChatClient);
    }

    @Test
    void proxiesAllowedNonStreamRequest() throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");
        body.putArray("messages").addObject().put("role", "user").put("content", "hi");
        when(deepSeekChatClient.postChat(any()))
                .thenReturn(new UpstreamChatResponse(200, "{\"id\":\"x\"}"));

        ResponseEntity<String> resp = application.complete(body);

        assertEquals(200, resp.getStatusCode().value());
        assertEquals("{\"id\":\"x\"}", resp.getBody());
        verify(deepSeekChatClient).postChat(any());
    }

    @Test
    void rejectsDisallowedModelWithoutUpstreamCall() {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", "gpt-4o");

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.complete(body));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("model_not_allowed", ex.getReason());
        verify(deepSeekChatClient, never()).postChat(any());
    }

    @Test
    void rejectsStreamTrueWithoutUpstreamCall() {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");
        body.put("stream", true);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.complete(body));
        assertEquals("stream_not_supported", ex.getReason());
        verify(deepSeekChatClient, never()).postChat(any());
    }

    @Test
    void mapsMissingUpstreamKeyTo503() {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");
        when(deepSeekChatClient.postChat(any())).thenThrow(UpstreamException.notConfigured());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.complete(body));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertEquals("upstream_not_configured", ex.getReason());
    }

    @Test
    void mapsUpstreamUnauthorizedTo502() {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", "deepseek-v4-flash");
        when(deepSeekChatClient.postChat(any())).thenThrow(UpstreamException.error());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.complete(body));
        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertEquals("upstream_error", ex.getReason());
    }
}
