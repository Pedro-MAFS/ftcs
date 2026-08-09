package com.mfs.tokengateway.admin.api;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.admin.api.dto.AdminAdjustmentRequest;
import com.mfs.tokengateway.admin.api.dto.AdminAdjustmentResponse;
import com.mfs.tokengateway.admin.application.AdminAdjustmentApplication;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 人工充值 / 调账（US-G6-07）。
 */
@RestController
@RequestMapping("/admin/v1/users")
public class AdminAdjustmentController {

    private final AdminAdjustmentApplication adjustmentApplication;

    public AdminAdjustmentController(AdminAdjustmentApplication adjustmentApplication) {
        this.adjustmentApplication = adjustmentApplication;
    }

    @PostMapping("/{id}/adjustments")
    public AdminAdjustmentResponse adjust(
            @PathVariable("id") long id,
            @RequestBody AdminAdjustmentRequest body,
            HttpServletRequest request) {
        return adjustmentApplication.adjust(id, body, request.getRemoteAddr());
    }
}
