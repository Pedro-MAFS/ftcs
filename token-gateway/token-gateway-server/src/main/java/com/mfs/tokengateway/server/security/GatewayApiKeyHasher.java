package com.mfs.tokengateway.server.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import org.springframework.stereotype.Component;

/**
 * 网关 API Key 哈希（US-G0-06 / G0-08）。
 * <p>
 * {@code SHA-256( UTF8(pepper) || UTF8(raw) )} → 小写 hex 64 字符。
 */
@Component
public class GatewayApiKeyHasher {

    public String hash(String pepper, String rawApiKey) {
        if (pepper == null || pepper.isBlank()) {
            throw new IllegalArgumentException("pepper must not be blank");
        }
        if (rawApiKey == null || rawApiKey.isBlank()) {
            throw new IllegalArgumentException("rawApiKey must not be blank");
        }
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(pepper.getBytes(StandardCharsets.UTF_8));
            md.update(rawApiKey.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
