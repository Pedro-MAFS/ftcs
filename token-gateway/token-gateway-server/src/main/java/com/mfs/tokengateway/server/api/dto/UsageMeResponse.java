package com.mfs.tokengateway.server.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** {@code GET /v1/usage/me} 响应（US-G0-16：本期仅余额）。 */
public class UsageMeResponse {

    @JsonProperty("user_id")
    private long userId;

    @JsonProperty("tenant_id")
    private String tenantId;

    @JsonProperty("user_code")
    private String userCode;

    @JsonProperty("balance_li")
    private long balanceLi;

    private String currency = "CNY";

    @JsonProperty("currency_subunit")
    private String currencySubunit = "li";

    @JsonProperty("li_per_yuan")
    private int liPerYuan = 1000;

    private KeyView key;

    public long getUserId() {
        return userId;
    }

    public void setUserId(long userId) {
        this.userId = userId;
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

    public long getBalanceLi() {
        return balanceLi;
    }

    public void setBalanceLi(long balanceLi) {
        this.balanceLi = balanceLi;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getCurrencySubunit() {
        return currencySubunit;
    }

    public void setCurrencySubunit(String currencySubunit) {
        this.currencySubunit = currencySubunit;
    }

    public int getLiPerYuan() {
        return liPerYuan;
    }

    public void setLiPerYuan(int liPerYuan) {
        this.liPerYuan = liPerYuan;
    }

    public KeyView getKey() {
        return key;
    }

    public void setKey(KeyView key) {
        this.key = key;
    }

    public static class KeyView {

        private String name;
        private String prefix;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getPrefix() {
            return prefix;
        }

        public void setPrefix(String prefix) {
            this.prefix = prefix;
        }
    }
}
