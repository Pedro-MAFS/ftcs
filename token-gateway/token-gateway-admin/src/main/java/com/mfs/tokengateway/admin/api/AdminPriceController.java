package com.mfs.tokengateway.admin.api;

import java.time.Instant;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.admin.api.dto.AdminPriceCreateRequest;
import com.mfs.tokengateway.admin.api.dto.AdminPriceListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminPriceListResponse.AdminPriceItem;
import com.mfs.tokengateway.admin.application.AdminPriceApplication;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/**
 * 价目管理 API（US-G6-10）：只读列表/时间线 + 仅 INSERT。
 */
@RestController
@RequestMapping("/admin/v1/prices")
public class AdminPriceController {

    private final AdminPriceApplication adminPriceApplication;

    public AdminPriceController(AdminPriceApplication adminPriceApplication) {
        this.adminPriceApplication = adminPriceApplication;
    }

    @GetMapping
    public AdminPriceListResponse list(
            @RequestParam(value = "model", required = false) String model,
            @RequestParam(value = "include_history", defaultValue = "false") boolean includeHistory,
            @RequestParam(value = "include_scheduled", defaultValue = "true") boolean includeScheduled,
            @RequestParam(value = "as_of", required = false) Instant asOf) {
        return adminPriceApplication.list(model, includeHistory, includeScheduled, asOf);
    }

    /** model 可含点号（如 tavily.search）。 */
    @GetMapping("/{model:.+}")
    public AdminPriceListResponse timeline(
            @PathVariable("model") String model,
            @RequestParam(value = "as_of", required = false) Instant asOf) {
        return adminPriceApplication.timeline(model, asOf);
    }

    @PostMapping
    public ResponseEntity<AdminPriceItem> create(
            @Valid @RequestBody AdminPriceCreateRequest body, HttpServletRequest request) {
        String client = request.getRemoteAddr();
        AdminPriceItem created = adminPriceApplication.create(body, client);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
