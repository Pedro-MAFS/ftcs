package com.mfs.tokengateway.server.web;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.server.PathContainer;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.security.UcIdentity;
import com.mfs.tokengateway.server.security.UcIdentityResolver;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 请求结束访问日志 + UC 身份写入 MDC（US-G0-14）。不记录 body。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class AccessLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(AccessLogFilter.class);

    private final TokenGatewayProperties properties;
    private final UcIdentityResolver ucIdentityResolver;
    private final AntPathMatcher antPathMatcher = new AntPathMatcher();
    private final PathPatternParser pathPatternParser = new PathPatternParser();

    public AccessLogFilter(TokenGatewayProperties properties, UcIdentityResolver ucIdentityResolver) {
        this.properties = properties;
        this.ucIdentityResolver = ucIdentityResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        long start = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            enrichUcMdcQuietly();
            if (shouldAccessLog(request)) {
                long latencyMs = (System.nanoTime() - start) / 1_000_000L;
                log.info("access method={} path={} status={} latencyMs={}",
                        request.getMethod(),
                        request.getRequestURI(),
                        response.getStatus(),
                        latencyMs);
            }
        }
    }

    private void enrichUcMdcQuietly() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return;
        }
        Object principal = authentication.getPrincipal();
        if (principal == null || "anonymousUser".equals(principal)) {
            return;
        }
        try {
            UcIdentity id = ucIdentityResolver.resolve(authentication);
            MDC.put(RequestIdFilter.MDC_TENANT, id.getTenantId());
            MDC.put(RequestIdFilter.MDC_USER_CODE, id.getUserCode());
        } catch (RuntimeException ignored) {
            // 未带齐 claim 或非 UC 主体时跳过，不影响访问日志
        }
    }

    private boolean shouldAccessLog(HttpServletRequest request) {
        TokenGatewayProperties.Observability obs = properties.getObservability();
        if (!obs.isAccessLogEnabled()) {
            return false;
        }
        String path = request.getRequestURI();
        for (String pattern : obs.getAccessLogExclude()) {
            if (matches(path, pattern)) {
                return false;
            }
        }
        return true;
    }

    private boolean matches(String path, String pattern) {
        if (pattern == null || pattern.isBlank()) {
            return false;
        }
        String p = pattern.trim();
        if (antPathMatcher.match(p, path)) {
            return true;
        }
        try {
            PathPattern pathPattern = pathPatternParser.parse(p);
            return pathPattern.matches(PathContainer.parsePath(path));
        } catch (Exception ex) {
            return false;
        }
    }
}
