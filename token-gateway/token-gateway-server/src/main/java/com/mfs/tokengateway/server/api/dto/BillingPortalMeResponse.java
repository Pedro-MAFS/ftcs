package com.mfs.tokengateway.server.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 用户面板账户摘要（US-G4-02）；不返回 tenant。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BillingPortalMeResponse {

    @JsonProperty("user_code")
    private String userCode;

    @JsonProperty("user_code_masked")
    private String userCodeMasked;

    private String status;

    @JsonProperty("balance_li")
    private long balanceLi;

    @JsonProperty("expires_in")
    private Long expiresIn;

    public String getUserCode() {
        return userCode;
    }

    public void setUserCode(String userCode) {
        this.userCode = userCode;
    }

    public String getUserCodeMasked() {
        return userCodeMasked;
    }

    public void setUserCodeMasked(String userCodeMasked) {
        this.userCodeMasked = userCodeMasked;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public long getBalanceLi() {
        return balanceLi;
    }

    public void setBalanceLi(long balanceLi) {
        this.balanceLi = balanceLi;
    }

    public Long getExpiresIn() {
        return expiresIn;
    }

    public void setExpiresIn(Long expiresIn) {
        this.expiresIn = expiresIn;
    }
}
