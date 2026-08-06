package com.mfs.tokengateway.server.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

/** 微信充值订单响应（GET 本地读 / POST sync 查单共用）。 */
public class WechatOrderResponse {

    @JsonProperty("out_trade_no")
    private String outTradeNo;

    private String status;

    /** 本次微信查单 trade_state；本地短路未查时可 null */
    @JsonProperty("trade_state")
    private String tradeState;

    @JsonProperty("amount_yuan")
    private String amountYuan;

    @JsonProperty("amount_li")
    private Long amountLi;

    @JsonProperty("code_url")
    private String codeUrl;

    @JsonProperty("credited_li")
    private Long creditedLi;

    @JsonProperty("balance_li")
    private Long balanceLi;

    @JsonProperty("last_notify_at")
    private Instant lastNotifyAt;

    @JsonProperty("last_notify_trade_state")
    private String lastNotifyTradeState;

    @JsonProperty("last_notify_result")
    private String lastNotifyResult;

    @JsonProperty("notify_count")
    private Integer notifyCount;

    @JsonProperty("last_sync_at")
    private Instant lastSyncAt;

    @JsonProperty("last_sync_trade_state")
    private String lastSyncTradeState;

    @JsonProperty("last_sync_result")
    private String lastSyncResult;

    @JsonProperty("sync_count")
    private Integer syncCount;

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

    public String getTradeState() {
        return tradeState;
    }

    public void setTradeState(String tradeState) {
        this.tradeState = tradeState;
    }

    public String getAmountYuan() {
        return amountYuan;
    }

    public void setAmountYuan(String amountYuan) {
        this.amountYuan = amountYuan;
    }

    public Long getAmountLi() {
        return amountLi;
    }

    public void setAmountLi(Long amountLi) {
        this.amountLi = amountLi;
    }

    public String getCodeUrl() {
        return codeUrl;
    }

    public void setCodeUrl(String codeUrl) {
        this.codeUrl = codeUrl;
    }

    public Long getCreditedLi() {
        return creditedLi;
    }

    public void setCreditedLi(Long creditedLi) {
        this.creditedLi = creditedLi;
    }

    public Long getBalanceLi() {
        return balanceLi;
    }

    public void setBalanceLi(Long balanceLi) {
        this.balanceLi = balanceLi;
    }

    public Instant getLastNotifyAt() {
        return lastNotifyAt;
    }

    public void setLastNotifyAt(Instant lastNotifyAt) {
        this.lastNotifyAt = lastNotifyAt;
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

    public Integer getNotifyCount() {
        return notifyCount;
    }

    public void setNotifyCount(Integer notifyCount) {
        this.notifyCount = notifyCount;
    }

    public Instant getLastSyncAt() {
        return lastSyncAt;
    }

    public void setLastSyncAt(Instant lastSyncAt) {
        this.lastSyncAt = lastSyncAt;
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

    public Integer getSyncCount() {
        return syncCount;
    }

    public void setSyncCount(Integer syncCount) {
        this.syncCount = syncCount;
    }
}
