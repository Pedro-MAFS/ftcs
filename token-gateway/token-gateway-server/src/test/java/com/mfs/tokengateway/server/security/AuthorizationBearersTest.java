package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class AuthorizationBearersTest {

    @Test
    void extractsToken() {
        assertEquals("sk-abc", AuthorizationBearers.extractBearerToken("Bearer sk-abc"));
        assertEquals("sk-abc", AuthorizationBearers.extractBearerToken("bearer sk-abc"));
        assertEquals("sk-abc", AuthorizationBearers.extractBearerToken("  BEARER   sk-abc  "));
    }

    @Test
    void missingHeaderIsNull() {
        assertNull(AuthorizationBearers.extractBearerToken(null));
    }

    @Test
    void invalidFormatIsEmpty() {
        assertEquals("", AuthorizationBearers.extractBearerToken(""));
        assertEquals("", AuthorizationBearers.extractBearerToken("Basic xxx"));
        assertEquals("", AuthorizationBearers.extractBearerToken("Bearer"));
        assertEquals("", AuthorizationBearers.extractBearerToken("Bearerersk-x"));
    }
}
