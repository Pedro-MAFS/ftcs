package com.mfs.tokengateway.db.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class GatewayApiKeyGeneratorTest {

    private final GatewayApiKeyGenerator generator = new GatewayApiKeyGenerator();

    @Test
    void generateStartsWithSkAndIsUrlSafe() {
        String key = generator.generate();
        assertTrue(key.startsWith("sk-"));
        assertTrue(key.length() > 10);
        assertTrue(key.substring(3).matches("^[A-Za-z0-9_-]+$"));
    }

    @Test
    void successiveKeysDiffer() {
        assertNotEquals(generator.generate(), generator.generate());
    }

    @Test
    void prefixIsFirstTenChars() {
        String raw = "sk-abcdefghijklmnop";
        assertEquals("sk-abcdefg", generator.prefixOf(raw));
        assertEquals("sk-ab", generator.prefixOf("sk-ab"));
    }
}
