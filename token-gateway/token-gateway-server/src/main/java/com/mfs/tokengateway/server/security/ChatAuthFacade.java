package com.mfs.tokengateway.server.security;

/**
 * Chat 入口鉴权门面（US-G0-03 占位；US-G0-08 替换为 sk 校验）。
 */
public interface ChatAuthFacade {

    /** 未通过则抛出 401；通过后可继续代理（G0-08 起可附带用户上下文）。 */
    void requireAuthenticated();
}
