package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/users 分页响应（US-G6-04）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminUserListResponse {

    private int page;
    private int size;
    private long total;
    private List<AdminUserListItem> items = new ArrayList<>();

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

    public List<AdminUserListItem> getItems() {
        return items;
    }

    public void setItems(List<AdminUserListItem> items) {
        this.items = items != null ? items : new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AdminUserListItem {

        private Long id;

        @JsonProperty("tenant_id")
        private String tenantId;

        @JsonProperty("user_code")
        private String userCode;

        @JsonProperty("balance_li")
        private Long balanceLi;

        @JsonProperty("balance_yuan")
        private BigDecimal balanceYuan;

        private String status;

        @JsonProperty("created_at")
        private Instant createdAt;

        @JsonProperty("updated_at")
        private Instant updatedAt;

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
        }

        public String getTenantId() {
            return tenantId;
        }

        public void setTenantId(String tenantId) {
            this.tenantId = tenantId;
        }

        public String getUserCode() {
            return userCode;
        }

        public void setUserCode(String userCode) {
            this.userCode = userCode;
        }

        public Long getBalanceLi() {
            return balanceLi;
        }

        public void setBalanceLi(Long balanceLi) {
            this.balanceLi = balanceLi;
        }

        public BigDecimal getBalanceYuan() {
            return balanceYuan;
        }

        public void setBalanceYuan(BigDecimal balanceYuan) {
            this.balanceYuan = balanceYuan;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public Instant getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(Instant createdAt) {
            this.createdAt = createdAt;
        }

        public Instant getUpdatedAt() {
            return updatedAt;
        }

        public void setUpdatedAt(Instant updatedAt) {
            this.updatedAt = updatedAt;
        }
    }
}
