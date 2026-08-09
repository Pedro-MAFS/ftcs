package com.mfs.tokengateway.admin.api;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端探活（匿名）。库连通性请看 {@code /actuator/health}。
 */
@RestController
@RequestMapping("/admin/v1")
public class AdminHealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("service", "token-gateway-admin");
        return body;
    }
}
