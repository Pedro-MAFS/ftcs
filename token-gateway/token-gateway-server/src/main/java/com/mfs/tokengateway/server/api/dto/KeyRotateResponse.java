package com.mfs.tokengateway.server.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * {@code POST /v1/keys/rotate} 成功响应（含明文一次）。
 */
public class KeyRotateResponse {

    private String action;
    private String name;

    @JsonProperty("api_key")
    private String apiKey;

    private String prefix;
    private String status;
    private UserView user;

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getPrefix() {
        return prefix;
    }

    public void setPrefix(String prefix) {
        this.prefix = prefix;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public UserView getUser() {
        return user;
    }

    public void setUser(UserView user) {
        this.user = user;
    }

    public static class UserView {

        @JsonProperty("tenant_id")
        private String tenantId;

        @JsonProperty("user_code")
        private String userCode;

        @JsonProperty("balance_li")
        private long balanceLi;

        private String status;

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

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }
    }
}
