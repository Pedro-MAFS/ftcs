package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

class UcIdentityResolverTest {

    private final UcIdentityResolver resolver = new UcIdentityResolver();

    @Test
    void resolvesFromPrincipalAccessors() {
        Authentication auth = new UsernamePasswordAuthenticationToken(
                new FakePrincipal("1", "u_abc", "sub-1", "ftcs-desktop"),
                "n/a",
                List.of());
        UcIdentity id = resolver.resolve(auth);
        assertEquals("1", id.getTenantId());
        assertEquals("u_abc", id.getUserCode());
        assertEquals("sub-1", id.getSubject());
        assertEquals("ftcs-desktop", id.getClientId());
    }

    @Test
    void rejectsMissingClaims() {
        Authentication auth = new UsernamePasswordAuthenticationToken(
                new FakePrincipal(null, "u_abc", "sub-1", null),
                "n/a",
                List.of());
        assertThrows(ResponseStatusException.class, () -> resolver.resolve(auth));
    }

    @Test
    void resolvesFromClaimMapPrincipal() {
        Authentication auth = new UsernamePasswordAuthenticationToken(
                new ClaimMapPrincipal(Map.of(
                        "tenant_id", "1",
                        "user_code", "u_xyz",
                        "sub", "99",
                        "aud", "ftcs-desktop")),
                "n/a",
                List.of());
        UcIdentity id = resolver.resolve(auth);
        assertEquals("1", id.getTenantId());
        assertEquals("u_xyz", id.getUserCode());
        assertEquals("99", id.getSubject());
        assertEquals("ftcs-desktop", id.getClientId());
    }

    @SuppressWarnings("unused")
    private static final class FakePrincipal {
        private final String tenantId;
        private final String userCode;
        private final String subject;
        private final String clientId;

        private FakePrincipal(String tenantId, String userCode, String subject, String clientId) {
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

    @SuppressWarnings("unused")
    private static final class ClaimMapPrincipal {
        private final Map<String, Object> claims;

        private ClaimMapPrincipal(Map<String, Object> claims) {
            this.claims = claims;
        }

        public Map<String, Object> getClaims() {
            return claims;
        }
    }
}
