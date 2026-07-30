package com.mfs.tokengateway.server.security;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.stereotype.Component;

/**
 * 网关 API Key 明文生成（US-G0-06）。
 * <p>
 * 格式：{@code sk-} + 32 字节密码学随机 → Base64URL（无填充）。
 */
@Component
public class GatewayApiKeyGenerator {

    private static final int PREFIX_LEN = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    public String generate() {
        byte[] buf = new byte[32];
        RANDOM.nextBytes(buf);
        return "sk-" + Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    /** 与库 {@code key_prefix} 一致：明文前 10 字符（含 {@code sk-}）。 */
    public String prefixOf(String rawApiKey) {
        if (rawApiKey == null || rawApiKey.isEmpty()) {
            return "";
        }
        return rawApiKey.length() <= PREFIX_LEN ? rawApiKey : rawApiKey.substring(0, PREFIX_LEN);
    }
}
