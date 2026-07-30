package com.mfs.tokengateway.server.web;

import java.io.IOException;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 最早写入 {@code requestId} MDC 与响应头；finally 清理本请求 MDC（US-G0-14）。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    static final String MDC_TENANT = "tenantId";
    static final String MDC_USER_CODE = "userCode";
    static final String MDC_KEY_NAME = "keyName";
    static final String MDC_MODEL = "model";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String requestId = RequestIds.resolve(request.getHeader(RequestIds.HEADER));
        MDC.put(RequestIds.MDC_KEY, requestId);
        response.setHeader(RequestIds.HEADER, requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(RequestIds.MDC_KEY);
            MDC.remove(MDC_TENANT);
            MDC.remove(MDC_USER_CODE);
            MDC.remove(MDC_KEY_NAME);
            MDC.remove(MDC_MODEL);
        }
    }
}
