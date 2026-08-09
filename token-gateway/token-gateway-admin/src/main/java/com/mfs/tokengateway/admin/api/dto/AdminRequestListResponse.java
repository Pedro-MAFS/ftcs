package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/requests 分页（US-G6-06）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminRequestListResponse {

    private int page;
    private int size;
    private long total;
    private AdminTimeWindow window;
    private List<AdminRequestListItem> items = new ArrayList<>();

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getSize() {
        return size;
    }

    public void setSize(int size) {
        this.size = size;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public AdminTimeWindow getWindow() {
        return window;
    }

    public void setWindow(AdminTimeWindow window) {
        this.window = window;
    }

    public List<AdminRequestListItem> getItems() {
        return items;
    }

    public void setItems(List<AdminRequestListItem> items) {
        this.items = items != null ? items : new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AdminRequestListItem {

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

        @JsonProperty("error_summary")
        private String errorSummary;

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

        public String getErrorSummary() {
            return errorSummary;
        }

        public void setErrorSummary(String errorSummary) {
            this.errorSummary = errorSummary;
        }
    }
}
