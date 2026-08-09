package com.mfs.tokengateway.admin.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.admin.api.dto.AdminUserDetailResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserStatusUpdateRequest;
import com.mfs.tokengateway.admin.application.AdminUserApplication;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/**
 * 用户管理 API（US-G6-04）：列表 / 详情 / 启停。
 */
@RestController
@RequestMapping("/admin/v1/users")
public class AdminUserController {

    private final AdminUserApplication adminUserApplication;

    public AdminUserController(AdminUserApplication adminUserApplication) {
        this.adminUserApplication = adminUserApplication;
    }

    @GetMapping
    public AdminUserListResponse list(
            @RequestParam(value = "q", required = false) String q,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "tenant_id", required = false) String tenantId,
            @RequestParam(value = "user_code", required = false) String userCode,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return adminUserApplication.list(q, status, tenantId, userCode, page, size);
    }

    @GetMapping("/{id}")
    public AdminUserDetailResponse get(@PathVariable("id") long id) {
        return adminUserApplication.get(id);
    }

    @PatchMapping("/{id}/status")
    public AdminUserDetailResponse updateStatus(
            @PathVariable("id") long id,
            @Valid @RequestBody AdminUserStatusUpdateRequest body,
            HttpServletRequest request) {
        return adminUserApplication.updateStatus(id, body, request.getRemoteAddr());
    }
}
