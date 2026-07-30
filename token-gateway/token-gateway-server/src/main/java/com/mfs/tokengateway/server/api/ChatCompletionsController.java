package com.mfs.tokengateway.server.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.mfs.tokengateway.server.application.ChatProxyApplication;
import com.mfs.tokengateway.server.security.ChatAuthFacade;

/**
 * OpenAI 兼容 Chat Completions（US-G0-03 非流式）。
 * <p>
 * 鉴权由 {@link ChatAuthFacade} 负责；G0-03 占位恒 401，G0-08 起校验网关 sk。
 */
@RestController
@RequestMapping("/v1/chat")
public class ChatCompletionsController {

    private final ChatAuthFacade chatAuthFacade;
    private final ChatProxyApplication chatProxyApplication;

    public ChatCompletionsController(
            ChatAuthFacade chatAuthFacade, ChatProxyApplication chatProxyApplication) {
        this.chatAuthFacade = chatAuthFacade;
        this.chatProxyApplication = chatProxyApplication;
    }

    @PostMapping("/completions")
    public ResponseEntity<String> completions(@RequestBody(required = false) JsonNode body) {
        chatAuthFacade.requireAuthenticated();
        return chatProxyApplication.complete(body);
    }
}
