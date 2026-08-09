package com.mfs.tokengateway.admin.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.admin.api.dto.AdminLedgerListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminRequestDetailResponse;
import com.mfs.tokengateway.admin.api.dto.AdminRequestListResponse;
import com.mfs.tokengateway.admin.application.AdminUsageApplication;

/**
 * 消费查询 API（US-G6-06）：request_logs + ledger 只读。
 */
@RestController
@RequestMapping("/admin/v1")
public class AdminUsageController {

    private final AdminUsageApplication adminUsageApplication;

    public AdminUsageController(AdminUsageApplication adminUsageApplication) {
        this.adminUsageApplication = adminUsageApplication;
    }

    @GetMapping("/requests")
    public AdminRequestListResponse listRequests(
            @RequestParam(value = "user_id", required = false) Long userId,
            @RequestParam(value = "q", required = false) String q,
            @RequestParam(value = "model", required = false) String model,
            @RequestParam(value = "billing_status", required = false) String billingStatus,
            @RequestParam(value = "key_name", required = false) String keyName,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return adminUsageApplication.listRequests(
                userId, q, model, billingStatus, keyName, status, from, to, page, size);
    }

    @GetMapping("/requests/{requestId}")
    public AdminRequestDetailResponse getRequest(@PathVariable("requestId") String requestId) {
        return adminUsageApplication.getRequest(requestId);
    }

    @GetMapping("/ledger")
    public AdminLedgerListResponse listLedger(
            @RequestParam(value = "user_id", required = false) Long userId,
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "request_id", required = false) String requestId,
            @RequestParam(value = "operator", required = false) String operator,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return adminUsageApplication.listLedger(
                userId, type, requestId, operator, from, to, page, size);
    }

    @GetMapping("/users/{id}/requests")
    public AdminRequestListResponse listRequestsForUser(
            @PathVariable("id") long id,
            @RequestParam(value = "q", required = false) String q,
            @RequestParam(value = "model", required = false) String model,
            @RequestParam(value = "billing_status", required = false) String billingStatus,
            @RequestParam(value = "key_name", required = false) String keyName,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return adminUsageApplication.listRequestsForUser(
                id, q, model, billingStatus, keyName, status, from, to, page, size);
    }

    @GetMapping("/users/{id}/ledger")
    public AdminLedgerListResponse listLedgerForUser(
            @PathVariable("id") long id,
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "request_id", required = false) String requestId,
            @RequestParam(value = "operator", required = false) String operator,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return adminUsageApplication.listLedgerForUser(
                id, type, requestId, operator, from, to, page, size);
    }
}
