package com.mfs.tokengateway.db.security;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Key {@code name} 规范化与校验（US-G0-06 / G6-05 共享）。
 * <p>
 * 非法时抛 {@link IllegalArgumentException}，message 为 {@code invalid_name}。
 */
public final class GatewayApiKeyNameRules {

    public static final String INVALID_NAME = "invalid_name";

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9._-]{1,64}$");

    private GatewayApiKeyNameRules() {}

    /** trim → lower-case → 校验 {@code [a-z0-9._-]{1,64}}。 */
    public static String normalizeAndValidate(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException(INVALID_NAME);
        }
        String normalized = name.trim().toLowerCase(Locale.ROOT);
        if (!NAME_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(INVALID_NAME);
        }
        return normalized;
    }
}
