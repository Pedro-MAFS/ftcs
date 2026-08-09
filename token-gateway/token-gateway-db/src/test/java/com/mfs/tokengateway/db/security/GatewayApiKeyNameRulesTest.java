package com.mfs.tokengateway.db.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class GatewayApiKeyNameRulesTest {

    @Test
    void normalizesCaseAndTrim() {
        assertEquals("ftcs-desktop", GatewayApiKeyNameRules.normalizeAndValidate("  FTCS-Desktop  "));
    }

    @Test
    void rejectsInvalid() {
        assertThrows(
                IllegalArgumentException.class, () -> GatewayApiKeyNameRules.normalizeAndValidate(""));
        assertThrows(
                IllegalArgumentException.class,
                () -> GatewayApiKeyNameRules.normalizeAndValidate("bad name"));
        assertThrows(
                IllegalArgumentException.class,
                () -> GatewayApiKeyNameRules.normalizeAndValidate("Has/Slash"));
    }
}
