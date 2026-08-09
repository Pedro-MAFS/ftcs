package com.mfs.tokengateway.admin.api.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/users/{userId}/keys（US-G6-05）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminUserKeyListResponse {

    @JsonProperty("user_id")
    private Long userId;

    private List<AdminUserKeyItem> items = new ArrayList<>();

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public List<AdminUserKeyItem> getItems() {
        return items;
    }

    public void setItems(List<AdminUserKeyItem> items) {
        this.items = items != null ? items : new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AdminUserKeyItem {

        private Long id;
        private String name;
        private String prefix;
        private String status;

        @JsonProperty("created_at")
        private Instant createdAt;

        @JsonProperty("updated_at")
        private Instant updatedAt;

        @JsonProperty("last_used_at")
        private Instant lastUsedAt;

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
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
