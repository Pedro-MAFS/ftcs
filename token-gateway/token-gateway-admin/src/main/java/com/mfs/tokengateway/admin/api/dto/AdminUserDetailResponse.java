package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/users/{id} 详情（US-G6-04）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminUserDetailResponse {

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

    @JsonProperty("rpm_limit")
    private Integer rpmLimit;

    @JsonProperty("tpm_limit")
    private Integer tpmLimit;

    @JsonProperty("daily_limit_li")
    private Long dailyLimitLi;

    @JsonProperty("created_at")
    private Instant createdAt;

    @JsonProperty("updated_at")
    private Instant updatedAt;

    @JsonProperty("key_total")
    private Long keyTotal;

    @JsonProperty("key_active")
    private Long keyActive;

    @JsonProperty("key_disabled")
    private Long keyDisabled;

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

    public Integer getRpmLimit() {
        return rpmLimit;
    }

    public void setRpmLimit(Integer rpmLimit) {
        this.rpmLimit = rpmLimit;
    }

    public Integer getTpmLimit() {
        return tpmLimit;
    }

    public void setTpmLimit(Integer tpmLimit) {
        this.tpmLimit = tpmLimit;
    }

    public Long getDailyLimitLi() {
        return dailyLimitLi;
    }

    public void setDailyLimitLi(Long dailyLimitLi) {
        this.dailyLimitLi = dailyLimitLi;
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

    public Long getKeyTotal() {
        return keyTotal;
    }

    public void setKeyTotal(Long keyTotal) {
        this.keyTotal = keyTotal;
    }

    public Long getKeyActive() {
        return keyActive;
    }

    public void setKeyActive(Long keyActive) {
        this.keyActive = keyActive;
    }

    public Long getKeyDisabled() {
        return keyDisabled;
    }

    public void setKeyDisabled(Long keyDisabled) {
        this.keyDisabled = keyDisabled;
    }
}
