package com.mfs.tokengateway.server.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.server.api.dto.KeyRotateRequest;
import com.mfs.tokengateway.server.api.dto.KeyRotateResponse;
import com.mfs.tokengateway.server.application.KeyRotateApplication;
import com.mfs.tokengateway.server.security.UcIdentity;
import com.mfs.tokengateway.server.security.UcIdentityResolver;

/**
 * 按 name 签发 / 重置网关 API Key（US-G0-06）。
 * <p>
 * 须 UC JWT；明文仅出现在成功响应体一次。
 */
@RestController
@RequestMapping("/v1/keys")
public class KeysRotateController {

    private final UcIdentityResolver ucIdentityResolver;
    private final KeyRotateApplication keyRotateApplication;

    public KeysRotateController(
            UcIdentityResolver ucIdentityResolver, KeyRotateApplication keyRotateApplication) {
        this.ucIdentityResolver = ucIdentityResolver;
        this.keyRotateApplication = keyRotateApplication;
    }

    @PostMapping("/rotate")
    public KeyRotateResponse rotate(@RequestBody(required = false) KeyRotateRequest request) {
        UcIdentity identity = ucIdentityResolver.requireCurrent();
        String name = request == null ? null : request.getName();
        return keyRotateApplication.rotate(identity, name);
    }
}
