package com.mfs.tokengateway.server.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 充值 / 面板 ticket 鉴权：保护微信 prepay、订单查询与用户面板 API（US-G3-01 / G3-06 / G4-01）。
 * <p>
 * Cookie {@code tg_recharge_ticket} 优先于 {@code Authorization: Bearer rt_…}。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RechargeTicketAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final String JSON_UNAUTHORIZED =
            "{\"reason\":\"" + RechargeTicketAuthService.REASON_INVALID + "\"}";

    private final RechargeTicketAuthService ticketAuthService;

    public RechargeTicketAuthFilter(RechargeTicketAuthService ticketAuthService) {
        this.ticketAuthService = ticketAuthService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && path.startsWith(context)) {
            path = path.substring(context.length());
        }
        return !matchesProtected(path);
    }

    static boolean matchesProtected(String path) {
        if (path == null) {
            return false;
        }
        if ("/v1/billing/wechat/prepay".equals(path)) {
            return true;
        }
        if (path.startsWith("/v1/billing/wechat/orders/")) {
            return true;
        }
        return path.startsWith("/v1/billing/portal/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String raw = extractTicket(request);
        Optional<RechargeCaller> resolved = ticketAuthService.resolve(raw);
        if (resolved.isEmpty()) {
            writeUnauthorized(response);
            return;
        }
        RechargeCaller caller = resolved.get();
        request.setAttribute(RechargeCaller.REQUEST_ATTR, caller);
        ticketAuthService.touchLastUsed(caller);
        filterChain.doFilter(request, response);
    }

    static String extractTicket(HttpServletRequest request) {
        String fromCookie = cookieValue(request, RechargeCaller.COOKIE_NAME);
        if (fromCookie != null && !fromCookie.isBlank()) {
            return fromCookie.trim();
        }
        String auth = request.getHeader("Authorization");
        if (auth != null && auth.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            String token = auth.substring(BEARER_PREFIX.length()).trim();
            return token.isEmpty() ? null : token;
        }
        return null;
    }

    private static String cookieValue(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private static void writeUnauthorized(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(JSON_UNAUTHORIZED);
    }
}
