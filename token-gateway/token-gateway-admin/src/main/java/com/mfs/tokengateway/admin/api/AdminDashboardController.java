package com.mfs.tokengateway.admin.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.admin.api.dto.AdminDashboardSeriesResponse;
import com.mfs.tokengateway.admin.api.dto.AdminDashboardSummaryResponse;
import com.mfs.tokengateway.admin.application.AdminDashboardApplication;

/** 运营大屏聚合 API（US-G6-02/03）。 */
@RestController
@RequestMapping("/admin/v1/dashboard")
public class AdminDashboardController {

    private final AdminDashboardApplication dashboardApplication;

    public AdminDashboardController(AdminDashboardApplication dashboardApplication) {
        this.dashboardApplication = dashboardApplication;
    }

    @GetMapping("/summary")
    public AdminDashboardSummaryResponse summary() {
        return dashboardApplication.summary();
    }

    @GetMapping("/series")
    public AdminDashboardSeriesResponse series(
            @RequestParam("metric") String metric,
            @RequestParam(value = "days", required = false) Integer days) {
        return dashboardApplication.series(metric, days);
    }
}
