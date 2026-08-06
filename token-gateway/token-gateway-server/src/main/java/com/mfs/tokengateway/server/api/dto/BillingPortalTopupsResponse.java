package com.mfs.tokengateway.server.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 用户面板充值列表（US-G4-04）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BillingPortalTopupsResponse {

    private List<BillingPortalTopupItem> items = new ArrayList<>();

    @JsonProperty("next_cursor")
    private String nextCursor;

    private Window window;

    public List<BillingPortalTopupItem> getItems() {
        return items;
    }

    public void setItems(List<BillingPortalTopupItem> items) {
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
    public static class BillingPortalTopupItem {

        @JsonProperty("out_trade_no")
        private String outTradeNo;

        @JsonProperty("created_at")
        private Instant createdAt;

        @JsonProperty("paid_at")
        private Instant paidAt;

        @JsonProperty("credited_at")
        private Instant creditedAt;

        @JsonProperty("amount_yuan")
        private BigDecimal amountYuan;

        private String status;

        private String description;

        @JsonProperty("wx_transaction_id")
        private String wxTransactionId;

        @JsonProperty("fail_reason")
        private String failReason;

        public String getOutTradeNo() {
            return outTradeNo;
        }

        public void setOutTradeNo(String outTradeNo) {
            this.outTradeNo = outTradeNo;
        }

        public Instant getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(Instant createdAt) {
            this.createdAt = createdAt;
        }

        public Instant getPaidAt() {
            return paidAt;
        }

        public void setPaidAt(Instant paidAt) {
            this.paidAt = paidAt;
        }

        public Instant getCreditedAt() {
            return creditedAt;
        }

        public void setCreditedAt(Instant creditedAt) {
            this.creditedAt = creditedAt;
        }

        public BigDecimal getAmountYuan() {
            return amountYuan;
        }

        public void setAmountYuan(BigDecimal amountYuan) {
            this.amountYuan = amountYuan;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public String getWxTransactionId() {
            return wxTransactionId;
        }

        public void setWxTransactionId(String wxTransactionId) {
            this.wxTransactionId = wxTransactionId;
        }

        public String getFailReason() {
            return failReason;
        }

        public void setFailReason(String failReason) {
            this.failReason = failReason;
        }
    }
}
