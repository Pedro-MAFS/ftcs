package com.mfs.tokengateway.server.security;

import java.time.Instant;

/**
 * 充值短时 ticket 校验通过后的调用方身份（US-G3-06）。
 */
public final class RechargeCaller {

    public static final String REQUEST_ATTR = "recharge.caller";
    public static final String COOKIE_NAME = "tg_recharge_ticket";

    private final long ticketId;
    private final String tenantId;
    private final String userCode;
    private final Long userId;
    private final Instant expiresAt;

    public RechargeCaller(
            long ticketId, String tenantId, String userCode, Long userId, Instant expiresAt) {
        this.ticketId = ticketId;
        this.tenantId = tenantId;
        this.userCode = userCode;
        this.userId = userId;
        this.expiresAt = expiresAt;
    }

    public long getTicketId() {
        return ticketId;
    }

    public String getTenantId() {
        return tenantId;
    }

    public String getUserCode() {
        return userCode;
    }

    public Long getUserId() {
        return userId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    /** 剩余有效秒数（向下取整，至少 0）。 */
    public long remainingSeconds(Instant now) {
        long sec = expiresAt.getEpochSecond() - now.getEpochSecond();
        return Math.max(0L, sec);
    }
}
