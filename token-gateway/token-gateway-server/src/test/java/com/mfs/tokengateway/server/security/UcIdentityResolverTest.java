package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

class UcIdentityResolverTest {

    private final UcIdentityResolver resolver = new UcIdentityResolver();

    @Test
    void resolvesFromRecordStylePrincipal() {
        Authentication auth = new UsernamePasswordAuthenticationToken(
                new RecordStylePrincipal("1", "u_abc", "sub-1", "ftcs-desktop"),
                "n/a",
                List.of());
        UcIdentity id = resolver.resolve(auth);
        assertEquals("1", id.getTenantId());
        assertEquals("u_abc", id.getUserCode());
        assertEquals("sub-1", id.getSubject());
        assertEquals("ftcs-desktop", id.getClientId());
    }

    @Test
    void resolvesFromJavaBeanPrincipal() {
        Authentication auth = new UsernamePasswordAuthenticationToken(
                new BeanPrincipal("1", "u_abc", "sub-1", "ftcs-desktop"),
                "n/a",
                List.of());
        UcIdentity id = resolver.resolve(auth);
        assertEquals("1", id.getTenantId());
        assertEquals("u_abc", id.getUserCode());
    }

    @Test
    void rejectsMissingClaims() {
        Authentication auth = new UsernamePasswordAuthenticationToken(
                new RecordStylePrincipal(null, "u_abc", "sub-1", null),
                "n/a",
                List.of());
        assertThrows(ResponseStatusException.class, () -> resolver.resolve(auth));
    }

    private record RecordStylePrincipal(String tenantId, String userCode, String subject, String clientId) {}

    @SuppressWarnings("unused")
    private static final class BeanPrincipal {
        private final String tenantId;
        private final String userCode;
        private final String subject;
        private final String clientId;

        private BeanPrincipal(String tenantId, String userCode, String subject, String clientId) {
            this.tenantId = tenantId;
            this.userCode = userCode;
            this.subject = subject;
            this.clientId = clientId;
        }

        public String getTenantId() {
            return tenantId;
        }

        public String getUserCode() {
            return userCode;
        }

        public String getSubject() {
            return subject;
        }

        public String getClientId() {
            return clientId;
        }
    }
}
