package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/ledger 分页（US-G6-06）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminLedgerListResponse {

    private int page;
    private int size;
    private long total;
    private AdminTimeWindow window;
    private List<AdminLedgerListItem> items = new ArrayList<>();

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

    public List<AdminLedgerListItem> getItems() {
        return items;
    }

    public void setItems(List<AdminLedgerListItem> items) {
        this.items = items != null ? items : new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AdminLedgerListItem {

        private Long id;

        @JsonProperty("user_id")
        private Long userId;

        @JsonProperty("user_code")
        private String userCode;

        @JsonProperty("tenant_id")
        private String tenantId;

        private String type;

        @JsonProperty("amount_li")
        private Long amountLi;

        @JsonProperty("amount_yuan")
        private BigDecimal amountYuan;

        @JsonProperty("balance_after_li")
        private Long balanceAfterLi;

        @JsonProperty("balance_after_yuan")
        private BigDecimal balanceAfterYuan;

        @JsonProperty("request_id")
        private String requestId;

        private String note;
        private String operator;

        /** wechat | manual；charge 为 null（US-G6-07）。 */
        private String source;

        @JsonProperty("created_at")
        private Instant createdAt;

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

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
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

        public BigDecimal getBalanceAfterYuan() {
            return balanceAfterYuan;
        }

        public void setBalanceAfterYuan(BigDecimal balanceAfterYuan) {
            this.balanceAfterYuan = balanceAfterYuan;
        }

        public String getRequestId() {
            return requestId;
        }

        public void setRequestId(String requestId) {
            this.requestId = requestId;
        }

        public String getNote() {
            return note;
        }

        public void setNote(String note) {
            this.note = note;
        }

        public String getOperator() {
            return operator;
        }

        public void setOperator(String operator) {
            this.operator = operator;
        }

        public String getSource() {
            return source;
        }

        public void setSource(String source) {
            this.source = source;
        }

        public Instant getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(Instant createdAt) {
            this.createdAt = createdAt;
        }
    }
}
