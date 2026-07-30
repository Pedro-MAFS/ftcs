package com.mfs.tokengateway.server.security;

/**
 * 解析 {@code Authorization: Bearer …}（大小写不敏感的 Bearer）。
 */
public final class AuthorizationBearers {

    private AuthorizationBearers() {
    }

    /**
     * @return token；{@code null} 表示 header 缺失；空串表示格式非法（有头但无法解析）
     */
    public static String extractBearerToken(String authorizationHeader) {
        if (authorizationHeader == null) {
            return null;
        }
        String trimmed = authorizationHeader.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        if (trimmed.length() < 7 || !trimmed.regionMatches(true, 0, "Bearer", 0, 6)) {
            return "";
        }
        // "Bearer" 后须有空白
        if (trimmed.length() == 6 || !Character.isWhitespace(trimmed.charAt(6))) {
            return "";
        }
        String token = trimmed.substring(6).trim();
        return token;
    }
}
