package com.mfs.tokengateway.server.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.server.api.dto.ModelsListResponse;
import com.mfs.tokengateway.server.application.ModelsApplication;
import com.mfs.tokengateway.server.security.ChatAuthFacade;

/**
 * 白名单且已定价的模型列表（US-G0-17）；鉴权同 Chat sk。
 */
@RestController
@RequestMapping("/v1")
public class ModelsController {

    private final ChatAuthFacade chatAuthFacade;
    private final ModelsApplication modelsApplication;

    public ModelsController(ChatAuthFacade chatAuthFacade, ModelsApplication modelsApplication) {
        this.chatAuthFacade = chatAuthFacade;
        this.modelsApplication = modelsApplication;
    }

    @GetMapping("/models")
    public ModelsListResponse models() {
        chatAuthFacade.requireAuthenticated();
        return modelsApplication.listAvailable();
    }
}
