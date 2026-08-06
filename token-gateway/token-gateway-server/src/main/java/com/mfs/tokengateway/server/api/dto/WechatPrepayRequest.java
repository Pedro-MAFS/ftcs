package com.mfs.tokengateway.server.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** {@code POST /v1/billing/wechat/prepay} 请求体。 */
public class WechatPrepayRequest {

    @JsonProperty("amount_yuan")
    private Object amountYuan;

    public Object getAmountYuan() {
        return amountYuan;
    }

    public void setAmountYuan(Object amountYuan) {
        this.amountYuan = amountYuan;
    }
}
