package com.mfs.tokengateway.server.security;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * US-G5-01：搜索鉴权占位 — 一律 401，禁止匿名打上游。
 * <p>
 * US-G5-02 将替换为挂载 {@link GatewaySkAuthFacade} + 余额预检。
 */
@Component
public class PendingSearchAuthFacade implements SearchAuthFacade {

    @Override
    public void requireAuthenticated() {
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "sk_auth_pending");
    }
}
