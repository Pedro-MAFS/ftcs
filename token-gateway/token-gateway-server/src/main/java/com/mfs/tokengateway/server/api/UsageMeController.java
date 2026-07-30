package com.mfs.tokengateway.server.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.server.api.dto.UsageMeResponse;
import com.mfs.tokengateway.server.application.UsageMeApplication;
import com.mfs.tokengateway.server.security.ChatAuthFacade;
import com.mfs.tokengateway.server.security.ChatCaller;

/**
 * 当前账户余额（US-G0-16）；鉴权同 Chat sk；本期不含今日用量。
 */
@RestController
@RequestMapping("/v1/usage")
public class UsageMeController {

    private final ChatAuthFacade chatAuthFacade;
    private final UsageMeApplication usageMeApplication;

    public UsageMeController(ChatAuthFacade chatAuthFacade, UsageMeApplication usageMeApplication) {
        this.chatAuthFacade = chatAuthFacade;
        this.usageMeApplication = usageMeApplication;
    }

    @GetMapping("/me")
    public UsageMeResponse me() {
        ChatCaller caller = chatAuthFacade.requireAuthenticated();
        return usageMeApplication.getMe(caller);
    }
}
