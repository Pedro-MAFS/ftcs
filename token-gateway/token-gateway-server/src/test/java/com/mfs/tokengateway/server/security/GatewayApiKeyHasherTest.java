package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;

class GatewayApiKeyHasherTest {

    private final GatewayApiKeyHasher hasher = new GatewayApiKeyHasher();

    @Test
    void matchesSha256OfPepperConcatRaw() throws Exception {
        String pepper = "test-pepper";
        String raw = "sk-known";
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update(pepper.getBytes(StandardCharsets.UTF_8));
        md.update(raw.getBytes(StandardCharsets.UTF_8));
        String expected = HexFormat.of().formatHex(md.digest());

        String actual = hasher.hash(pepper, raw);
        assertEquals(expected, actual);
        assertEquals(64, actual.length());
        assertTrue(actual.matches("^[0-9a-f]{64}$"));
        assertEquals(actual, hasher.hash(pepper, raw));
    }

    @Test
    void differentPepperOrRawYieldsDifferentHash() {
        String a = hasher.hash("p1", "sk-x");
        String b = hasher.hash("p2", "sk-x");
        String c = hasher.hash("p1", "sk-y");
        assertNotEquals(a, b);
        assertNotEquals(a, c);
    }

    @Test
    void rejectsBlankPepperOrRaw() {
        assertThrows(IllegalArgumentException.class, () -> hasher.hash(" ", "sk-x"));
        assertThrows(IllegalArgumentException.class, () -> hasher.hash("p", " "));
    }
}
