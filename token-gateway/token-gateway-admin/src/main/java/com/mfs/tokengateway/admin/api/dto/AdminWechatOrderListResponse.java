package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/wechat-orders 分页（US-G6-11）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminWechatOrderListResponse {

    private int page;
    private int size;
    private long total;
    private AdminTimeWindow window;
    private List<AdminWechatOrderListItem> items = new ArrayList<>();

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

    public List<AdminWechatOrderListItem> getItems() {
        return items;
    }

    public void setItems(List<AdminWechatOrderListItem> items) {
        this.items = items != null ? items : new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AdminWechatOrderListItem {

        private Long id;

        @JsonProperty("user_id")
        private Long userId;

        @JsonProperty("user_code")
        private String userCode;

        @JsonProperty("tenant_id")
        private String tenantId;

        @JsonProperty("out_trade_no")
        private String outTradeNo;

        private String status;

        @JsonProperty("amount_yuan")
        private BigDecimal amountYuan;

        @JsonProperty("wx_transaction_id")
        private String wxTransactionId;

        @JsonProperty("ledger_request_id")
        private String ledgerRequestId;

        @JsonProperty("fail_reason")
        private String failReason;

        private String description;

        @JsonProperty("created_at")
        private Instant createdAt;

        @JsonProperty("paid_at")
        private Instant paidAt;

        @JsonProperty("credited_at")
        private Instant creditedAt;

        @JsonProperty("last_notify_trade_state")
        private String lastNotifyTradeState;

        @JsonProperty("last_notify_result")
        private String lastNotifyResult;

        @JsonProperty("last_sync_trade_state")
        private String lastSyncTradeState;

        @JsonProperty("last_sync_result")
        private String lastSyncResult;

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
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

        public String getOutTradeNo() {
            return outTradeNo;
        }

        public void setOutTradeNo(String outTradeNo) {
            this.outTradeNo = outTradeNo;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public BigDecimal getAmountYuan() {
            return amountYuan;
        }

        public void setAmountYuan(BigDecimal amountYuan) {
            this.amountYuan = amountYuan;
        }

        public String getWxTransactionId() {
            return wxTransactionId;
        }

        public void setWxTransactionId(String wxTransactionId) {
            this.wxTransactionId = wxTransactionId;
        }

        public String getLedgerRequestId() {
            return ledgerRequestId;
        }

        public void setLedgerRequestId(String ledgerRequestId) {
            this.ledgerRequestId = ledgerRequestId;
        }

        public String getFailReason() {
            return failReason;
        }

        public void setFailReason(String failReason) {
            this.failReason = failReason;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
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

        public String getLastNotifyTradeState() {
            return lastNotifyTradeState;
        }

        public void setLastNotifyTradeState(String lastNotifyTradeState) {
            this.lastNotifyTradeState = lastNotifyTradeState;
        }

        public String getLastNotifyResult() {
            return lastNotifyResult;
        }

        public void setLastNotifyResult(String lastNotifyResult) {
            this.lastNotifyResult = lastNotifyResult;
        }

        public String getLastSyncTradeState() {
            return lastSyncTradeState;
        }

        public void setLastSyncTradeState(String lastSyncTradeState) {
            this.lastSyncTradeState = lastSyncTradeState;
        }

        public String getLastSyncResult() {
            return lastSyncResult;
        }

        public void setLastSyncResult(String lastSyncResult) {
            this.lastSyncResult = lastSyncResult;
        }
    }
}
