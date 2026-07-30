package com.mfs.tokengateway.server.application;

import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Key {@code name} 规范化与校验（US-G0-06）。 */
public final class KeyNameRules {

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9._-]{1,64}$");

    private KeyNameRules() {
    }

    /**
     * trim → lower-case → 校验 {@code [a-z0-9._-]{1,64}}。
     *
     * @throws ResponseStatusException 400 {@code invalid_name}
     */
    public static String normalizeAndValidate(String name) {
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_name");
        }
        String normalized = name.trim().toLowerCase(Locale.ROOT);
        if (!NAME_PATTERN.matcher(normalized).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_name");
        }
        return normalized;
    }
}
