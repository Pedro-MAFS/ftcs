package com.mfs.tokengateway.server.web;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * {@code X-Request-Id} / MDC {@code requestId} 生成与校验（US-G0-14）。
 */
public final class RequestIds {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    private static final int MAX_LEN = 64;
    private static final Pattern ALLOWED = Pattern.compile("^[A-Za-z0-9._-]+$");

    private RequestIds() {
    }

    /**
     * 采纳合法客户端头，否则生成新 UUID。
     */
    public static String resolve(String incoming) {
        if (incoming == null) {
            return newId();
        }
        String trimmed = incoming.trim();
        if (trimmed.isEmpty() || trimmed.length() > MAX_LEN || !ALLOWED.matcher(trimmed).matches()) {
            return newId();
        }
        return trimmed;
    }

    public static String newId() {
        return UUID.randomUUID().toString();
    }
}
