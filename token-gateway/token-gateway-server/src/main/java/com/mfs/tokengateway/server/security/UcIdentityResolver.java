package com.mfs.tokengateway.server.security;

import java.lang.reflect.Method;
import java.util.Collection;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * 从 RS 验签后的 {@link Authentication} 解析 {@link UcIdentity}。
 * <p>
 * 通过反射读取 UC {@code OAuthBearerPrincipal} / JWT claim，避免无 {@code -Puc-rs} 时强依赖 starter 类型。
 * Claim 约定：{@code tenant_id}、{@code user_code}（见 US-G0-05 设计 §7）。
 */
@Component
public class UcIdentityResolver {

    private static final Logger log = LoggerFactory.getLogger(UcIdentityResolver.class);

    public UcIdentity requireCurrent() {
        return resolve(SecurityContextHolder.getContext().getAuthentication());
    }

    public UcIdentity resolve(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw unauthorized("missing_authentication");
        }

        Object principal = authentication.getPrincipal();
        if (principal == null || "anonymousUser".equals(principal)) {
            throw unauthorized("anonymous");
        }

        Map<String, Object> claims = extractClaims(authentication, principal);

        String tenantId = firstNonBlank(
                invokeString(principal, "getTenantId"),
                claimAsString(claims, "tenant_id"),
                claimAsString(claims, "tenantId"));
        String userCode = firstNonBlank(
                invokeString(principal, "getUserCode"),
                claimAsString(claims, "user_code"),
                claimAsString(claims, "userCode"));
        String subject = firstNonBlank(
                invokeString(principal, "getSubject"),
                invokeString(principal, "getName"),
                claimAsString(claims, "sub"),
                authentication.getName());
        String clientId = firstNonBlank(
                invokeString(principal, "getClientId"),
                invokeString(principal, "getAud"),
                firstAudience(claims),
                claimAsString(claims, "client_id"),
                claimAsString(claims, "clientId"));

        if (isBlank(tenantId) || isBlank(userCode)) {
            log.warn("UC identity claims incomplete: hasTenantId={} hasUserCode={}",
                    !isBlank(tenantId), !isBlank(userCode));
            throw unauthorized("missing_identity_claims");
        }

        return new UcIdentity(tenantId, userCode, subject, clientId);
    }

    private static Map<String, Object> extractClaims(Authentication authentication, Object principal) {
        Object token = invoke(authentication, "getToken");
        Map<String, Object> fromToken = claimsFromJwtLike(token);
        if (!fromToken.isEmpty()) {
            return fromToken;
        }
        Map<String, Object> fromPrincipalJwt = claimsFromJwtLike(principal);
        if (!fromPrincipalJwt.isEmpty()) {
            return fromPrincipalJwt;
        }
        Object nestedToken = invoke(principal, "getToken");
        Map<String, Object> fromNested = claimsFromJwtLike(nestedToken);
        if (!fromNested.isEmpty()) {
            return fromNested;
        }
        Object attrs = invoke(principal, "getAttributes");
        if (attrs instanceof Map<?, ?> map) {
            return castStringKeyMap(map);
        }
        Object claims = invoke(principal, "getClaims");
        if (claims instanceof Map<?, ?> map) {
            return castStringKeyMap(map);
        }
        return Map.of();
    }

    private static Map<String, Object> claimsFromJwtLike(Object jwtLike) {
        if (jwtLike == null) {
            return Map.of();
        }
        Object claims = invoke(jwtLike, "getClaims");
        if (claims instanceof Map<?, ?> map) {
            return castStringKeyMap(map);
        }
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castStringKeyMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }

    private static String firstAudience(Map<String, Object> claims) {
        Object aud = claims.get("aud");
        if (aud instanceof String s) {
            return s;
        }
        if (aud instanceof Collection<?> c && !c.isEmpty()) {
            Object first = c.iterator().next();
            return first == null ? null : String.valueOf(first);
        }
        return null;
    }

    private static String claimAsString(Map<String, Object> claims, String key) {
        Object v = claims.get(key);
        return v == null ? null : String.valueOf(v);
    }

    private static String invokeString(Object target, String method) {
        Object v = invoke(target, method);
        return v == null ? null : String.valueOf(v);
    }

    private static Object invoke(Object target, String methodName) {
        if (target == null) {
            return null;
        }
        try {
            Method m = target.getClass().getMethod(methodName);
            return m.invoke(target);
        } catch (ReflectiveOperationException ex) {
            return null;
        }
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String v : values) {
            if (!isBlank(v)) {
                return v.trim();
            }
        }
        return null;
    }

    private static boolean isBlank(String v) {
        return v == null || v.isBlank() || "null".equalsIgnoreCase(v);
    }

    private static ResponseStatusException unauthorized(String reason) {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, reason);
    }
}
