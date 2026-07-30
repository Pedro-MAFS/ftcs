package com.mfs.tokengateway.server.security;

/**
 * Chat 入口鉴权门面（US-G0-08：网关 sk-）。
 */
public interface ChatAuthFacade {

    /**
     * 校验 {@code Authorization: Bearer sk-…}；失败抛出 401/403/503。
     *
     * @return 调用方上下文
     */
    ChatCaller requireAuthenticated();
}
