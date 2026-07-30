package com.mfs.tokengateway.server.api;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.server.security.UcIdentity;
import com.mfs.tokengateway.server.security.UcIdentityResolver;

/**
 * UC JWT 冒烟接口（US-G0-05）。不建户、不返回余额。
 */
@RestController
@RequestMapping("/v1/auth")
public class AuthWhoamiController {

    private final UcIdentityResolver ucIdentityResolver;

    public AuthWhoamiController(UcIdentityResolver ucIdentityResolver) {
        this.ucIdentityResolver = ucIdentityResolver;
    }

    @GetMapping("/whoami")
    public Map<String, String> whoami() {
        UcIdentity id = ucIdentityResolver.requireCurrent();
        Map<String, String> body = new LinkedHashMap<>();
        body.put("tenantId", id.getTenantId());
        body.put("userCode", id.getUserCode());
        if (id.getSubject() != null) {
            body.put("subject", id.getSubject());
        }
        if (id.getClientId() != null) {
            body.put("clientId", id.getClientId());
        }
        return body;
    }
}
