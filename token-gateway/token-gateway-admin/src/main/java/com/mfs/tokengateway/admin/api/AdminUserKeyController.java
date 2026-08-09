package com.mfs.tokengateway.admin.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.admin.api.dto.AdminUserKeyListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyListResponse.AdminUserKeyItem;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyRotateRequest;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyRotateResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyStatusUpdateRequest;
import com.mfs.tokengateway.admin.application.AdminUserKeyApplication;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/**
 * 用户 API Key 管理（US-G6-05）：列表 / 启停 / 强制 rotate。
 */
@RestController
@RequestMapping("/admin/v1/users/{userId}/keys")
public class AdminUserKeyController {

    private final AdminUserKeyApplication adminUserKeyApplication;

    public AdminUserKeyController(AdminUserKeyApplication adminUserKeyApplication) {
        this.adminUserKeyApplication = adminUserKeyApplication;
    }

    @GetMapping
    public AdminUserKeyListResponse list(@PathVariable("userId") long userId) {
        return adminUserKeyApplication.list(userId);
    }

    @PatchMapping("/{name}/status")
    public AdminUserKeyItem updateStatus(
            @PathVariable("userId") long userId,
            @PathVariable("name") String name,
            @Valid @RequestBody AdminUserKeyStatusUpdateRequest body,
            HttpServletRequest request) {
        return adminUserKeyApplication.updateStatus(userId, name, body, request.getRemoteAddr());
    }

    @PostMapping("/{name}/rotate")
    public AdminUserKeyRotateResponse rotate(
            @PathVariable("userId") long userId,
            @PathVariable("name") String name,
            @Valid @RequestBody AdminUserKeyRotateRequest body,
            HttpServletRequest request) {
        return adminUserKeyApplication.rotate(userId, name, body, request.getRemoteAddr());
    }
}
