package com.mfs.tokengateway.server.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** {@code POST /v1/billing/wechat/prepay} 成功响应。 */
public class WechatPrepayResponse {

    @JsonProperty("out_trade_no")
    private String outTradeNo;

    @JsonProperty("code_url")
    private String codeUrl;

    @JsonProperty("amount_yuan")
    private String amountYuan;

    @JsonProperty("amount_fen")
    private int amountFen;

    @JsonProperty("amount_li")
    private long amountLi;

    @JsonProperty("expires_in")
    private long expiresIn;

    private String status;

    public String getOutTradeNo() {
        return outTradeNo;
    }

    public void setOutTradeNo(String outTradeNo) {
        this.outTradeNo = outTradeNo;
    }

    public String getCodeUrl() {
        return codeUrl;
    }

    public void setCodeUrl(String codeUrl) {
        this.codeUrl = codeUrl;
    }

    public String getAmountYuan() {
        return amountYuan;
    }

    public void setAmountYuan(String amountYuan) {
        this.amountYuan = amountYuan;
    }

    public int getAmountFen() {
        return amountFen;
    }

    public void setAmountFen(int amountFen) {
        this.amountFen = amountFen;
    }

    public long getAmountLi() {
        return amountLi;
    }

    public void setAmountLi(long amountLi) {
        this.amountLi = amountLi;
    }

    public long getExpiresIn() {
        return expiresIn;
    }

    public void setExpiresIn(long expiresIn) {
        this.expiresIn = expiresIn;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
