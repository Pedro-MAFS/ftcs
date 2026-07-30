package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class PendingChatSkAuthFacadeTest {

    @Test
    void alwaysUnauthorized() {
        PendingChatSkAuthFacade facade = new PendingChatSkAuthFacade();
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, facade::requireAuthenticated);
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertEquals("sk_auth_pending", ex.getReason());
    }
}
