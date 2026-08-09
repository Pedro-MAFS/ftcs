package com.mfs.tokengateway.admin.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** POST /admin/v1/users/{userId}/keys/{name}/rotate（US-G6-05）。 */
public class AdminUserKeyRotateRequest {

    @NotBlank
    @Size(max = 128)
    private String operator;

    @NotBlank
    @Size(max = 512)
    private String note;

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
