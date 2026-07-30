package com.mfs.tokengateway.server.application;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JsonNode;
import com.mfs.tokengateway.server.upstream.DeepSeekChatClient;
import com.mfs.tokengateway.server.upstream.ModelWhitelist;
import com.mfs.tokengateway.server.upstream.UpstreamChatResponse;
import com.mfs.tokengateway.server.upstream.UpstreamException;

/**
 * 非流式 Chat 代理用例（US-G0-03）。不含鉴权、扣费。
 */
@Service
public class ChatProxyApplication {

    private final ModelWhitelist modelWhitelist;
    private final DeepSeekChatClient deepSeekChatClient;

    public ChatProxyApplication(ModelWhitelist modelWhitelist, DeepSeekChatClient deepSeekChatClient) {
        this.modelWhitelist = modelWhitelist;
        this.deepSeekChatClient = deepSeekChatClient;
    }

    public ResponseEntity<String> complete(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_json");
        }
        assertStreamAllowed(body);
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

    private void assertStreamAllowed(JsonNode body) {
        JsonNode stream = body.get("stream");
        if (stream != null && stream.isBoolean() && stream.booleanValue()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "stream_not_supported");
        }
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
