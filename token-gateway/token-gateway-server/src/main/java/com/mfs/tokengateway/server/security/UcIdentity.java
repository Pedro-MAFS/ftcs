package com.mfs.tokengateway.server.security;

/**
 * 用户中心主体（计费账户绑定键）。
 * <p>
 * 对应库表 {@code token_users} 的 {@code (tenant_id, user_code)}。
 */
public final class UcIdentity {

    private final String tenantId;
    private final String userCode;
    private final String subject;
    private final String clientId;

    public UcIdentity(String tenantId, String userCode, String subject, String clientId) {
        this.tenantId = tenantId;
        this.userCode = userCode;
        this.subject = subject;
        this.clientId = clientId;
    }

    public String getTenantId() {
        return tenantId;
    }

    public String getUserCode() {
        return userCode;
    }

    public String getSubject() {
        return subject;
    }

    public String getClientId() {
        return clientId;
    }
}
