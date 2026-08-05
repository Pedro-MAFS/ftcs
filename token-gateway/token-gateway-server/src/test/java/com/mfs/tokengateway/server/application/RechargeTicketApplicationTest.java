package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenRechargeTicketDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenRechargeTicket;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.api.dto.RechargeTicketResponse;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.security.GatewayApiKeyHasher;
import com.mfs.tokengateway.server.security.RechargeTicketGenerator;
import com.mfs.tokengateway.server.security.UcIdentity;

@ExtendWith(MockitoExtension.class)
class RechargeTicketApplicationTest {

    @Mock
    private TokenRechargeTicketDbService ticketDbService;

    @Mock
    private TokenUserDbService tokenUserDbService;

    @Mock
    private RechargeTicketGenerator ticketGenerator;

    private final GatewayApiKeyHasher hasher = new GatewayApiKeyHasher();
    private TokenGatewayProperties properties;
    private RechargeTicketApplication application;

    @BeforeEach
    void setUp() {
        properties = new TokenGatewayProperties();
        properties.getKey().setPepper("test-pepper");
        properties.getBilling().setRechargeTicketTtl(Duration.ofSeconds(300));
        // 单测无 Spring 代理：self 指向同一实例即可走 issueInTransaction
        application = new RechargeTicketApplication(
                null, ticketDbService, tokenUserDbService, ticketGenerator, hasher, properties);
        application = new RechargeTicketApplication(
                application, ticketDbService, tokenUserDbService, ticketGenerator, hasher, properties);
        application.validateConfig();
    }

    @Test
    void issuesTicketWithHashOnlyPersisted() {
        UcIdentity identity = new UcIdentity("1", "u_abc", "sub", "client");
        when(ticketDbService.countCreatedSince(eq("1"), eq("u_abc"), any(LocalDateTime.class))).thenReturn(0L);
        TokenUser user = new TokenUser();
        user.setId(42L);
        when(tokenUserDbService.findByTenantIdAndUserCode("1", "u_abc")).thenReturn(user);
        when(ticketGenerator.generate()).thenReturn("rt_abcdefghijklmnopqrstuvwxyzABCDEF");
        when(ticketDbService.save(any(TokenRechargeTicket.class))).thenAnswer(inv -> {
            TokenRechargeTicket row = inv.getArgument(0);
            row.setId(7L);
            return true;
        });

        RechargeTicketResponse body = application.issue(identity);

        assertTrue(body.getTicket().startsWith("rt_"));
        assertEquals(300L, body.getExpiresIn());
        assertEquals(body.getTicket(), "rt_abcdefghijklmnopqrstuvwxyzABCDEF");

        ArgumentCaptor<TokenRechargeTicket> captor = ArgumentCaptor.forClass(TokenRechargeTicket.class);
        verify(ticketDbService).save(captor.capture());
        TokenRechargeTicket saved = captor.getValue();
        assertEquals(hasher.hash("test-pepper", body.getTicket()), saved.getTicketHash());
        assertEquals("1", saved.getTenantId());
        assertEquals("u_abc", saved.getUserCode());
        assertEquals(42L, saved.getUserId());
        assertEquals(64, saved.getTicketHash().length());
    }

    @Test
    void allowsIssueWhenUserRowMissing() {
        UcIdentity identity = new UcIdentity("1", "u_new", "sub", "client");
        when(ticketDbService.countCreatedSince(eq("1"), eq("u_new"), any(LocalDateTime.class))).thenReturn(0L);
        when(tokenUserDbService.findByTenantIdAndUserCode("1", "u_new")).thenReturn(null);
        when(ticketGenerator.generate()).thenReturn("rt_onlynewuserxxxxxxxxxxxxxxxxxxxx");
        when(ticketDbService.save(any(TokenRechargeTicket.class))).thenReturn(true);

        RechargeTicketResponse body = application.issue(identity);
        assertTrue(body.getTicket().startsWith("rt_"));

        ArgumentCaptor<TokenRechargeTicket> captor = ArgumentCaptor.forClass(TokenRechargeTicket.class);
        verify(ticketDbService).save(captor.capture());
        assertEquals(null, captor.getValue().getUserId());
    }

    @Test
    void rateLimitsOverTwentyPerHour() {
        UcIdentity identity = new UcIdentity("1", "u_abc", "sub", "client");
        when(ticketDbService.countCreatedSince(eq("1"), eq("u_abc"), any(LocalDateTime.class)))
                .thenReturn((long) RechargeTicketApplication.MAX_TICKETS_PER_HOUR);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.issue(identity));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatusCode());
        assertEquals("recharge_ticket_rate_limited", ex.getReason());
        verify(ticketDbService, never()).save(any());
    }

    @Test
    void missingPepperReturns503() {
        properties.getKey().setPepper(" ");
        UcIdentity identity = new UcIdentity("1", "u_abc", "sub", "client");

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.issue(identity));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertEquals("missing_gateway_key_pepper", ex.getReason());
    }

    @Test
    void rejectsInvalidTtlAtStartup() {
        properties.getBilling().setRechargeTicketTtl(Duration.ofSeconds(30));
        assertThrows(IllegalStateException.class, () -> application.validateConfig());

        properties.getBilling().setRechargeTicketTtl(Duration.ofHours(25));
        assertThrows(IllegalStateException.class, () -> application.validateConfig());
    }
}
