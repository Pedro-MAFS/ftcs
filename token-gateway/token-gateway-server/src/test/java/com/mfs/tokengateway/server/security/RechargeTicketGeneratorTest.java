package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RechargeTicketGeneratorTest {

    private final RechargeTicketGenerator generator = new RechargeTicketGenerator();

    @Test
    void generatesRtPrefixAndUrlSafePayload() {
        String raw = generator.generate();
        assertTrue(raw.startsWith("rt_"));
        String payload = raw.substring(3);
        assertTrue(payload.matches("^[A-Za-z0-9_-]+$"));
        assertTrue(payload.length() >= 40);
        assertEquals(43, payload.length()); // 32 bytes → Base64URL without padding
    }

    @Test
    void successiveCallsDiffer() {
        assertTrue(!generator.generate().equals(generator.generate()));
    }
}
