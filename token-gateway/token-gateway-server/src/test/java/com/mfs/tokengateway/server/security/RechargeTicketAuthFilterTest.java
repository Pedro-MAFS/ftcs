package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.http.Cookie;

@ExtendWith(MockitoExtension.class)
class RechargeTicketAuthFilterTest {

    @Mock
    private RechargeTicketAuthService ticketAuthService;

    private RechargeTicketAuthFilter filter;

    @BeforeEach
    void setUp() {
        filter = new RechargeTicketAuthFilter(ticketAuthService);
    }

    @Test
    void matchesProtectedPaths() {
        assertTrue(RechargeTicketAuthFilter.matchesProtected("/v1/billing/wechat/prepay"));
        assertTrue(RechargeTicketAuthFilter.matchesProtected("/v1/billing/wechat/orders/tg1"));
        assertTrue(RechargeTicketAuthFilter.matchesProtected("/v1/billing/wechat/orders/tg1/sync"));
        assertFalse(RechargeTicketAuthFilter.matchesProtected("/v1/billing/wechat/notify"));
        assertFalse(RechargeTicketAuthFilter.matchesProtected("/v1/billing/recharge/ticket"));
    }

    @Test
    void prefersCookieOverBearer() throws Exception {
        RechargeCaller caller =
                new RechargeCaller(1L, "t1", "u1", 9L, Instant.now().plusSeconds(60));
        when(ticketAuthService.resolve("rt_cookie")).thenReturn(Optional.of(caller));

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/v1/billing/wechat/prepay");
        request.setCookies(new Cookie(RechargeCaller.COOKIE_NAME, "rt_cookie"));
        request.addHeader("Authorization", "Bearer rt_bearer");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertEquals(caller, request.getAttribute(RechargeCaller.REQUEST_ATTR));
        verify(ticketAuthService).resolve("rt_cookie");
        verify(ticketAuthService).touchLastUsed(caller);
        verify(ticketAuthService, never()).resolve("rt_bearer");
    }

    @Test
    void rejectsMissingTicket() throws Exception {
        when(ticketAuthService.resolve(null)).thenReturn(Optional.empty());

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/v1/billing/wechat/prepay");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("invalid_recharge_ticket"));
        verify(ticketAuthService, never()).touchLastUsed(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void skipsUnprotected() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/health");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        verify(ticketAuthService, never()).resolve(anyString());
        assertEquals(200, response.getStatus());
    }
}
