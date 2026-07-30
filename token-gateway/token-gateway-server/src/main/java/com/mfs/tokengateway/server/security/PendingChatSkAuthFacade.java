package com.mfs.tokengateway.server.security;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * G0-03 占位：Chat 一律 401，防止 sk 鉴权未上时匿名消耗上游额度。
 * <p>
 * 无任何配置可绕过。G0-08 将提供真正的 sk 实现并替换本 Bean（或改条件装配）。
 */
@Component
public class PendingChatSkAuthFacade implements ChatAuthFacade {

    @Override
    public void requireAuthenticated() {
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "sk_auth_pending");
    }
}
