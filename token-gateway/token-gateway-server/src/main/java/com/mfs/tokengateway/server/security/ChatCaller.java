package com.mfs.tokengateway.server.security;

/**
 * Chat 调用方上下文（US-G0-08）；供代理与后续扣费（G0-10）使用。
 */
public final class ChatCaller {

    public static final String REQUEST_ATTR = "chat.caller";

    private final long userId;
    private final long keyId;
    private final String keyName;
    private final String tenantId;
    private final String userCode;

    public ChatCaller(long userId, long keyId, String keyName, String tenantId, String userCode) {
        this.userId = userId;
        this.keyId = keyId;
        this.keyName = keyName;
        this.tenantId = tenantId;
        this.userCode = userCode;
    }

    public long getUserId() {
        return userId;
    }

    public long getKeyId() {
        return keyId;
    }

    public String getKeyName() {
        return keyName;
    }

    public String getTenantId() {
        return tenantId;
    }

    public String getUserCode() {
        return userCode;
    }
}
