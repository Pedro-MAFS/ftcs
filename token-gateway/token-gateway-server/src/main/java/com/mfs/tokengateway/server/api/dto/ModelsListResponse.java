package com.mfs.tokengateway.server.api.dto;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/** {@code GET /v1/models} 响应（US-G0-17）。 */
public class ModelsListResponse {

    private String object = "list";
    private List<ModelItem> data = new ArrayList<>();

    public String getObject() {
        return object;
    }

    public void setObject(String object) {
        this.object = object;
    }

    public List<ModelItem> getData() {
        return data;
    }

    public void setData(List<ModelItem> data) {
        this.data = data;
    }

    public static class ModelItem {

        private String id;
        private String object = "model";

        @JsonProperty("owned_by")
        private String ownedBy = "deepseek";

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getObject() {
            return object;
        }

        public void setObject(String object) {
            this.object = object;
        }

        public String getOwnedBy() {
            return ownedBy;
        }

        public void setOwnedBy(String ownedBy) {
            this.ownedBy = ownedBy;
        }
    }
}
