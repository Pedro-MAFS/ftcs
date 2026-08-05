package com.mfs.tokengateway.server.security;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.stereotype.Component;

/**
 * 充值短时 ticket 明文生成（US-G3-06）。
 * <p>
 * 格式：{@code rt_} + 32 字节密码学随机 → Base64URL（无填充）。
 */
@Component
public class RechargeTicketGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    public String generate() {
        byte[] buf = new byte[32];
        RANDOM.nextBytes(buf);
        return "rt_" + Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }
}
