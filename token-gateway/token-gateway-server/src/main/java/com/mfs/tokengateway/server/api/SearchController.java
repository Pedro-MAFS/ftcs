package com.mfs.tokengateway.server.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.mfs.tokengateway.server.application.SearchProxyApplication;
import com.mfs.tokengateway.server.security.SearchAuthFacade;

/**
 * Tavily 搜索代理入口（US-G5-01；鉴权占位，G5-02 换真 sk）。
 */
@RestController
@RequestMapping("/v1")
public class SearchController {

    private final SearchAuthFacade searchAuthFacade;
    private final SearchProxyApplication searchProxyApplication;

    public SearchController(
            SearchAuthFacade searchAuthFacade, SearchProxyApplication searchProxyApplication) {
        this.searchAuthFacade = searchAuthFacade;
        this.searchProxyApplication = searchProxyApplication;
    }

    @PostMapping("/search")
    public ResponseEntity<String> search(@RequestBody(required = false) JsonNode body) {
        searchAuthFacade.requireAuthenticated();
        return searchProxyApplication.search(body);
    }
}
