package com.mfs.tokengateway.server.security;

import java.lang.reflect.Method;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * 从 RS 验签后的 {@link Authentication#getPrincipal()} 解析 {@link UcIdentity}。
 * <p>
 * UC {@code OAuthBearerPrincipal} 为 record 风格访问器（{@code tenantId()} / {@code userCode()}），
 * 同时兼容 JavaBean {@code getXxx()}。
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

        String tenantId = readString(principal, "tenantId", "getTenantId");
        String userCode = readString(principal, "userCode", "getUserCode");
        String subject = firstNonBlank(
                readString(principal, "subject", "getSubject"),
                readString(principal, "name", "getName"),
                authentication.getName());
        String clientId = firstNonBlank(
                readString(principal, "clientId", "getClientId"),
                readString(principal, "aud", "getAud"));

        if (isBlank(tenantId) || isBlank(userCode)) {
            log.warn(
                    "UC identity incomplete: principalType={} hasTenantId={} hasUserCode={}",
                    principal.getClass().getName(),
                    !isBlank(tenantId),
                    !isBlank(userCode));
            throw unauthorized("missing_identity_claims");
        }

        return new UcIdentity(tenantId, userCode, subject, clientId);
    }

    private static String readString(Object target, String... methods) {
        for (String name : methods) {
            Object v = invoke(target, name);
            if (v != null) {
                String s = String.valueOf(v);
                if (!isBlank(s)) {
                    return s.trim();
                }
            }
        }
        return null;
    }

    private static Object invoke(Object target, String methodName) {
        try {
            Method m = target.getClass().getMethod(methodName);
            return m.invoke(target);
        } catch (ReflectiveOperationException ex) {
            return null;
        }
    }

    private static String firstNonBlank(String... values) {
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
