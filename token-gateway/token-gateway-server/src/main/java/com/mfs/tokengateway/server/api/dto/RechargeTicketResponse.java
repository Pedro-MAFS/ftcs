package com.mfs.tokengateway.server.api.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * {@code POST /v1/billing/recharge/ticket} 成功响应（含明文一次）。
 */
public class RechargeTicketResponse {

    private String ticket;

    @JsonProperty("expires_in")
    private long expiresIn;

    @JsonProperty("expires_at")
    private Instant expiresAt;

    public String getTicket() {
        return ticket;
    }

    public void setTicket(String ticket) {
        this.ticket = ticket;
    }

    public long getExpiresIn() {
        return expiresIn;
    }

    public void setExpiresIn(long expiresIn) {
        this.expiresIn = expiresIn;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }
}
