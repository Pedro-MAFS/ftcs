package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.mfs.tokengateway.db.dbservice.TokenRechargeTicketDbService;
import com.mfs.tokengateway.db.po.TokenRechargeTicket;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

@ExtendWith(MockitoExtension.class)
class RechargeTicketAuthServiceTest {

    @Mock
    private TokenRechargeTicketDbService ticketDbService;

    private final GatewayApiKeyHasher hasher = new GatewayApiKeyHasher();
    private TokenGatewayProperties properties;
    private RechargeTicketAuthService service;

    @BeforeEach
    void setUp() {
        properties = new TokenGatewayProperties();
        properties.getKey().setPepper("test-pepper");
        service = new RechargeTicketAuthService(ticketDbService, hasher, properties);
    }

    @Test
    void resolvesValidTicket() {
        String raw = "rt_abcdefghijklmnopqrstuvwxyzABCDEF";
        String hash = hasher.hash("test-pepper", raw);
        TokenRechargeTicket row = new TokenRechargeTicket();
        row.setId(9L);
        row.setTicketHash(hash);
        row.setTenantId("1");
        row.setUserCode("u_abc");
        row.setUserId(42L);
        row.setExpiresAt(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(5));
        when(ticketDbService.findByTicketHash(hash)).thenReturn(row);

        Optional<RechargeCaller> caller = service.resolve(raw);
        assertTrue(caller.isPresent());
        assertEquals("1", caller.get().getTenantId());
        assertEquals("u_abc", caller.get().getUserCode());
        assertEquals(42L, caller.get().getUserId());
        assertEquals(9L, caller.get().getTicketId());
    }

    @Test
    void rejectsExpiredOrRevokedOrBadPrefix() {
        assertTrue(service.resolve("sk-not-a-ticket").isEmpty());
        assertTrue(service.resolve("").isEmpty());

        String raw = "rt_abcdefghijklmnopqrstuvwxyzABCDEF";
        String hash = hasher.hash("test-pepper", raw);
        TokenRechargeTicket expired = new TokenRechargeTicket();
        expired.setId(1L);
        expired.setTicketHash(hash);
        expired.setTenantId("1");
        expired.setUserCode("u");
        expired.setExpiresAt(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1));
        when(ticketDbService.findByTicketHash(hash)).thenReturn(expired);
        assertTrue(service.resolve(raw).isEmpty());

        TokenRechargeTicket revoked = new TokenRechargeTicket();
        revoked.setId(2L);
        revoked.setTicketHash(hash);
        revoked.setTenantId("1");
        revoked.setUserCode("u");
        revoked.setExpiresAt(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(5));
        revoked.setRevokedAt(LocalDateTime.now(ZoneOffset.UTC));
        when(ticketDbService.findByTicketHash(hash)).thenReturn(revoked);
        assertTrue(service.resolve(raw).isEmpty());
    }

    @Test
    void touchUpdatesLastUsed() {
        RechargeCaller caller = new RechargeCaller(
                3L, "1", "u", null, java.time.Instant.now().plusSeconds(60));
        when(ticketDbService.updateLastUsedAt(ArgumentMatchers.eq(3L), ArgumentMatchers.any()))
                .thenReturn(true);
        service.touchLastUsed(caller);
        verify(ticketDbService).updateLastUsedAt(ArgumentMatchers.eq(3L), ArgumentMatchers.any());
    }
}
