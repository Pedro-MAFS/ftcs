package com.mfs.tokengateway.server.security;

/**
 * 搜索入口鉴权门面（US-G5-01 占位；US-G5-02 换真 sk + 预检）。
 */
public interface SearchAuthFacade {

    /**
     * 校验调用方；失败抛出 401/403 等。
     * <p>
     * G5-01：恒 401 {@code sk_auth_pending}。
     */
    void requireAuthenticated();
}
