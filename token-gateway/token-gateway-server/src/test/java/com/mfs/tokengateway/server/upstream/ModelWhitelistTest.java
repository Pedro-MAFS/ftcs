package com.mfs.tokengateway.server.upstream;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;

import org.junit.jupiter.api.Test;

class ModelWhitelistTest {

    private final ModelWhitelist whitelist =
            new ModelWhitelist(Set.of("deepseek-v4-flash", "deepseek-v4-pro"));

    @Test
    void allowsConfiguredModels() {
        assertTrue(whitelist.isAllowed("deepseek-v4-flash"));
        assertTrue(whitelist.isAllowed("deepseek-v4-pro"));
    }

    @Test
    void rejectsUnknownAndCaseMismatch() {
        assertFalse(whitelist.isAllowed("gpt-4o"));
        assertFalse(whitelist.isAllowed("deepseek-chat"));
        assertFalse(whitelist.isAllowed("Deepseek-v4-flash"));
        assertFalse(whitelist.isAllowed(null));
    }
}
