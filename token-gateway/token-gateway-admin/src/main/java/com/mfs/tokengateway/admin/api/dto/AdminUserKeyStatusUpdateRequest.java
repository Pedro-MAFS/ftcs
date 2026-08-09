package com.mfs.tokengateway.admin.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** PATCH /admin/v1/users/{userId}/keys/{name}/status（US-G6-05）。 */
public class AdminUserKeyStatusUpdateRequest {

    @NotBlank
    private String status;

    @NotBlank
    @Size(max = 128)
    private String operator;

    @NotBlank
    @Size(max = 512)
    private String note;

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getOperator() {
        return operator;
    }

    public void setOperator(String operator) {
        this.operator = operator;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
