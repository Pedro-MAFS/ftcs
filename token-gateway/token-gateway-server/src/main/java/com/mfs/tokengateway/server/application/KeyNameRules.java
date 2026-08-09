package com.mfs.tokengateway.server.application;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.security.GatewayApiKeyNameRules;

/** Key {@code name} 规范化与校验（US-G0-06）；委托共享规则。 */
public final class KeyNameRules {

    private KeyNameRules() {}

    /**
     * trim → lower-case → 校验 {@code [a-z0-9._-]{1,64}}。
     *
     * @throws ResponseStatusException 400 {@code invalid_name}
     */
    public static String normalizeAndValidate(String name) {
        try {
            return GatewayApiKeyNameRules.normalizeAndValidate(name);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, GatewayApiKeyNameRules.INVALID_NAME);
        }
    }
}
