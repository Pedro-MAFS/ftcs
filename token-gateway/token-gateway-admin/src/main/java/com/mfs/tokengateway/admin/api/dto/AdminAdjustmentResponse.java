package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 人工充值/调账成功响应（US-G6-07）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminAdjustmentResponse {

    @JsonProperty("user_id")
    private Long userId;

    @JsonProperty("user_code")
    private String userCode;

    @JsonProperty("tenant_id")
    private String tenantId;

    @JsonProperty("ledger_id")
    private Long ledgerId;

    private String type;

    @JsonProperty("amount_li")
    private Long amountLi;

    @JsonProperty("amount_yuan")
    private BigDecimal amountYuan;

    @JsonProperty("balance_before_li")
    private Long balanceBeforeLi;

    @JsonProperty("balance_before_yuan")
    private BigDecimal balanceBeforeYuan;

    @JsonProperty("balance_after_li")
    private Long balanceAfterLi;

    @JsonProperty("balance_after_yuan")
    private BigDecimal balanceAfterYuan;

    private String operator;
    private String note;
    private String source;

    @JsonProperty("created_at")
    private Instant createdAt;

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

    public Long getLedgerId() {
        return ledgerId;
    }

    public void setLedgerId(Long ledgerId) {
        this.ledgerId = ledgerId;
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

    public Long getBalanceBeforeLi() {
        return balanceBeforeLi;
    }

    public void setBalanceBeforeLi(Long balanceBeforeLi) {
        this.balanceBeforeLi = balanceBeforeLi;
    }

    public BigDecimal getBalanceBeforeYuan() {
        return balanceBeforeYuan;
    }

    public void setBalanceBeforeYuan(BigDecimal balanceBeforeYuan) {
        this.balanceBeforeYuan = balanceBeforeYuan;
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

    public String getOperator() {
        return operator;
    }

    public void setOperator(String operator) {
        this.operator = operator;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
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
