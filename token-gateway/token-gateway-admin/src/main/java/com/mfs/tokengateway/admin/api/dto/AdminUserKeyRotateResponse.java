package com.mfs.tokengateway.admin.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** POST …/keys/{name}/rotate 响应；{@code api_key} 明文仅此一次（US-G6-05）。 */
public class AdminUserKeyRotateResponse {

    private String action;

    @JsonProperty("user_id")
    private Long userId;

    private String name;
    private String prefix;
    private String status;

    @JsonProperty("api_key")
    private String apiKey;

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }
}
