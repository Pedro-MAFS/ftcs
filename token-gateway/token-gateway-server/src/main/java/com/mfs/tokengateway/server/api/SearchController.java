package com.mfs.tokengateway.server.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import com.fasterxml.jackson.databind.JsonNode;
import com.mfs.tokengateway.server.application.SearchProxyApplication;
import com.mfs.tokengateway.server.billing.BalanceGuard;
import com.mfs.tokengateway.server.security.ChatAuthFacade;
import com.mfs.tokengateway.server.security.ChatCaller;

/**
 * Tavily 搜索代理入口（US-G5-01 代理 + US-G5-02 sk 鉴权与余额预检）。
 */
@RestController
@RequestMapping("/v1")
public class SearchController {

    private final ChatAuthFacade chatAuthFacade;
    private final BalanceGuard balanceGuard;
    private final SearchProxyApplication searchProxyApplication;

    public SearchController(
            ChatAuthFacade chatAuthFacade,
            BalanceGuard balanceGuard,
            SearchProxyApplication searchProxyApplication) {
        this.chatAuthFacade = chatAuthFacade;
        this.balanceGuard = balanceGuard;
        this.searchProxyApplication = searchProxyApplication;
    }

    @PostMapping("/search")
    public ResponseEntity<String> search(@RequestBody(required = false) JsonNode body) {
        ChatCaller caller = chatAuthFacade.requireAuthenticated();
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs != null) {
            attrs.setAttribute(ChatCaller.REQUEST_ATTR, caller, RequestAttributes.SCOPE_REQUEST);
        }
        balanceGuard.requireSufficientBalance(caller.getUserId());
        return searchProxyApplication.search(body);
    }
}
