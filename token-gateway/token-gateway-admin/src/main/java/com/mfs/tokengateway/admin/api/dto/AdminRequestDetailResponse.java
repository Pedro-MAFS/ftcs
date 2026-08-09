package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/requests/{requestId} 详情（US-G6-06）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminRequestDetailResponse {

    @JsonProperty("request_id")
    private String requestId;

    @JsonProperty("created_at")
    private Instant createdAt;

    @JsonProperty("user_id")
    private Long userId;

    @JsonProperty("user_code")
    private String userCode;

    @JsonProperty("tenant_id")
    private String tenantId;

    @JsonProperty("key_id")
    private Long keyId;

    @JsonProperty("key_name")
    private String keyName;

    private String model;
    private String status;

    @JsonProperty("billing_status")
    private String billingStatus;

    @JsonProperty("prompt_tokens")
    private Integer promptTokens;

    @JsonProperty("completion_tokens")
    private Integer completionTokens;

    @JsonProperty("cached_tokens")
    private Integer cachedTokens;

    @JsonProperty("uncached_tokens")
    private Integer uncachedTokens;

    @JsonProperty("revenue_li")
    private Long revenueLi;

    @JsonProperty("revenue_yuan")
    private BigDecimal revenueYuan;

    @JsonProperty("cogs_li")
    private Long cogsLi;

    @JsonProperty("cogs_yuan")
    private BigDecimal cogsYuan;

    @JsonProperty("margin_li")
    private Long marginLi;

    @JsonProperty("margin_yuan")
    private BigDecimal marginYuan;

    @JsonProperty("latency_ms")
    private Integer latencyMs;

    @JsonProperty("upstream_status")
    private Integer upstreamStatus;

    @JsonProperty("error_summary")
    private String errorSummary;

    @JsonProperty("settle_owner")
    private String settleOwner;

    @JsonProperty("settle_claimed_at")
    private Instant settleClaimedAt;

    @JsonProperty("ledger_charge")
    private LedgerChargeSummary ledgerCharge;

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getUserCode() {
        return userCode;
    }

    public void setUserCode(String userCode) {
        this.userCode = userCode;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public Long getKeyId() {
        return keyId;
    }

    public void setKeyId(Long keyId) {
        this.keyId = keyId;
    }

    public String getKeyName() {
        return keyName;
    }

    public void setKeyName(String keyName) {
        this.keyName = keyName;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getBillingStatus() {
        return billingStatus;
    }

    public void setBillingStatus(String billingStatus) {
        this.billingStatus = billingStatus;
    }

    public Integer getPromptTokens() {
        return promptTokens;
    }

    public void setPromptTokens(Integer promptTokens) {
        this.promptTokens = promptTokens;
    }

    public Integer getCompletionTokens() {
        return completionTokens;
    }

    public void setCompletionTokens(Integer completionTokens) {
        this.completionTokens = completionTokens;
    }

    public Integer getCachedTokens() {
        return cachedTokens;
    }

    public void setCachedTokens(Integer cachedTokens) {
        this.cachedTokens = cachedTokens;
    }

    public Integer getUncachedTokens() {
        return uncachedTokens;
    }

    public void setUncachedTokens(Integer uncachedTokens) {
        this.uncachedTokens = uncachedTokens;
    }

    public Long getRevenueLi() {
        return revenueLi;
    }

    public void setRevenueLi(Long revenueLi) {
        this.revenueLi = revenueLi;
    }

    public BigDecimal getRevenueYuan() {
        return revenueYuan;
    }

    public void setRevenueYuan(BigDecimal revenueYuan) {
        this.revenueYuan = revenueYuan;
    }

    public Long getCogsLi() {
        return cogsLi;
    }

    public void setCogsLi(Long cogsLi) {
        this.cogsLi = cogsLi;
    }

    public BigDecimal getCogsYuan() {
        return cogsYuan;
    }

    public void setCogsYuan(BigDecimal cogsYuan) {
        this.cogsYuan = cogsYuan;
    }

    public Long getMarginLi() {
        return marginLi;
    }

    public void setMarginLi(Long marginLi) {
        this.marginLi = marginLi;
    }

    public BigDecimal getMarginYuan() {
        return marginYuan;
    }

    public void setMarginYuan(BigDecimal marginYuan) {
        this.marginYuan = marginYuan;
    }

    public Integer getLatencyMs() {
        return latencyMs;
    }

    public void setLatencyMs(Integer latencyMs) {
        this.latencyMs = latencyMs;
    }

    public Integer getUpstreamStatus() {
        return upstreamStatus;
    }

    public void setUpstreamStatus(Integer upstreamStatus) {
        this.upstreamStatus = upstreamStatus;
    }

    public String getErrorSummary() {
        return errorSummary;
    }

    public void setErrorSummary(String errorSummary) {
        this.errorSummary = errorSummary;
    }

    public String getSettleOwner() {
        return settleOwner;
    }

    public void setSettleOwner(String settleOwner) {
        this.settleOwner = settleOwner;
    }

    public Instant getSettleClaimedAt() {
        return settleClaimedAt;
    }

    public void setSettleClaimedAt(Instant settleClaimedAt) {
        this.settleClaimedAt = settleClaimedAt;
    }

    public LedgerChargeSummary getLedgerCharge() {
        return ledgerCharge;
    }

    public void setLedgerCharge(LedgerChargeSummary ledgerCharge) {
        this.ledgerCharge = ledgerCharge;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class LedgerChargeSummary {

        private Long id;

        @JsonProperty("amount_li")
        private Long amountLi;

        @JsonProperty("amount_yuan")
        private BigDecimal amountYuan;

        @JsonProperty("balance_after_li")
        private Long balanceAfterLi;

        @JsonProperty("created_at")
        private Instant createdAt;

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
        }

        public Long getAmountLi() {
            return amountLi;
        }

        public void setAmountLi(Long amountLi) {
            this.amountLi = amountLi;
        }

        public BigDecimal getAmountYuan() {
            return amountYuan;
        }

        public void setAmountYuan(BigDecimal amountYuan) {
            this.amountYuan = amountYuan;
        }

        public Long getBalanceAfterLi() {
            return balanceAfterLi;
        }

        public void setBalanceAfterLi(Long balanceAfterLi) {
            this.balanceAfterLi = balanceAfterLi;
        }

        public Instant getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(Instant createdAt) {
            this.createdAt = createdAt;
        }
    }
}
