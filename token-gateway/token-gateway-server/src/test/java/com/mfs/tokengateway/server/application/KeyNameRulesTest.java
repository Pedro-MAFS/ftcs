package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class KeyNameRulesTest {

    @Test
    void lowercasesAndTrims() {
        assertEquals("ftcs-desktop", KeyNameRules.normalizeAndValidate("  FTCS-Desktop  "));
    }

    @Test
    void rejectsBlankAndIllegal() {
        assertThrows(ResponseStatusException.class, () -> KeyNameRules.normalizeAndValidate(""));
        assertThrows(ResponseStatusException.class, () -> KeyNameRules.normalizeAndValidate("bad name"));
        assertThrows(ResponseStatusException.class, () -> KeyNameRules.normalizeAndValidate("Has/Slash"));
    }
}
