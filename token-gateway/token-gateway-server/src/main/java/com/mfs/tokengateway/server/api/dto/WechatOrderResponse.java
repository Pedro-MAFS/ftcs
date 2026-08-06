package com.mfs.tokengateway.server.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** {@code GET /v1/billing/wechat/orders/{outTradeNo}} 响应（US-G3-01 薄读）。 */
public class WechatOrderResponse {

    @JsonProperty("out_trade_no")
    private String outTradeNo;

    private String status;

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
}
