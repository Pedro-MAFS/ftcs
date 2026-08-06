package com.mfs.tokengateway.server.api.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 用户面板 API Key 元信息列表（US-G4-08）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BillingPortalKeysResponse {

    private List<BillingPortalKeyItem> items = new ArrayList<>();

    public List<BillingPortalKeyItem> getItems() {
        return items;
    }

    public void setItems(List<BillingPortalKeyItem> items) {
        this.items = items != null ? items : new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public static class BillingPortalKeyItem {

        private String name;

        @JsonProperty("key_prefix")
        private String keyPrefix;

        private String status;

        @JsonProperty("created_at")
        private Instant createdAt;

        @JsonProperty("updated_at")
        private Instant updatedAt;

        @JsonProperty("last_used_at")
        private Instant lastUsedAt;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getKeyPrefix() {
            return keyPrefix;
        }

        public void setKeyPrefix(String keyPrefix) {
            this.keyPrefix = keyPrefix;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
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

        public Instant getLastUsedAt() {
            return lastUsedAt;
        }

        public void setLastUsedAt(Instant lastUsedAt) {
            this.lastUsedAt = lastUsedAt;
        }
    }
}
