package com.mfs.tokengateway.server.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 用户面板消费列表（US-G4-03）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BillingPortalUsageResponse {

    private List<BillingPortalUsageItem> items = new ArrayList<>();

    @JsonProperty("next_cursor")
    private String nextCursor;

    private Window window;

    public List<BillingPortalUsageItem> getItems() {
        return items;
    }

    public void setItems(List<BillingPortalUsageItem> items) {
        this.items = items != null ? items : new ArrayList<>();
    }

    public String getNextCursor() {
        return nextCursor;
    }

    public void setNextCursor(String nextCursor) {
        this.nextCursor = nextCursor;
    }

    public Window getWindow() {
        return window;
    }

    public void setWindow(Window window) {
        this.window = window;
    }

    public static class Window {
        private Instant from;
        private Instant to;

        public Window() {}

        public Window(Instant from, Instant to) {
            this.from = from;
            this.to = to;
        }

        public Instant getFrom() {
            return from;
        }

        public void setFrom(Instant from) {
            this.from = from;
        }

        public Instant getTo() {
            return to;
        }

        public void setTo(Instant to) {
            this.to = to;
        }
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public static class BillingPortalUsageItem {

        @JsonProperty("request_id")
        private String requestId;

        @JsonProperty("created_at")
        private Instant createdAt;

        private String model;

        @JsonProperty("key_name")
        private String keyName;

        private String status;

        @JsonProperty("billing_status")
        private String billingStatus;

        @JsonProperty("prompt_tokens")
        private Integer promptTokens;

        @JsonProperty("completion_tokens")
        private Integer completionTokens;

        @JsonProperty("charge_yuan")
        private BigDecimal chargeYuan;

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

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public String getKeyName() {
            return keyName;
        }

        public void setKeyName(String keyName) {
            this.keyName = keyName;
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

        public BigDecimal getChargeYuan() {
            return chargeYuan;
        }

        public void setChargeYuan(BigDecimal chargeYuan) {
            this.chargeYuan = chargeYuan;
        }

        public String getErrorSummary() {
            return errorSummary;
        }

        public void setErrorSummary(String errorSummary) {
            this.errorSummary = errorSummary;
        }
    }
}
