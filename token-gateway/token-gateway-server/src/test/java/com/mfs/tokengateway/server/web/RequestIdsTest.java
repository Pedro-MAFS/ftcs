package com.mfs.tokengateway.server.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RequestIdsTest {

    @Test
    void adoptsValidClientId() {
        assertEquals("client-abc_1", RequestIds.resolve("client-abc_1"));
    }

    @Test
    void rejectsBlankAndGenerates() {
        String id = RequestIds.resolve("  ");
        assertFalse(id.isBlank());
        assertTrue(id.contains("-"));
    }

    @Test
    void rejectsIllegalChars() {
        String id = RequestIds.resolve("bad id with space");
        assertNotEquals("bad id with space", id);
    }

    @Test
    void rejectsTooLong() {
        String tooLong = "a".repeat(65);
        assertNotEquals(tooLong, RequestIds.resolve(tooLong));
    }
}
