package com.mfs.tokengateway.server.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.api.dto.BillingPortalMeResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalUsageResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalUsageResponse.BillingPortalUsageItem;
import com.mfs.tokengateway.server.security.RechargeCaller;

/** 用户面板只读查询（US-G4-02 / G4-03）。 */
@Service
public class BillingPortalApplication {

    static final int DEFAULT_USAGE_LIMIT = 20;
    static final int MAX_USAGE_LIMIT = 50;
    static final int DEFAULT_WINDOW_DAYS = 30;
    static final int MAX_WINDOW_DAYS = 90;

    private final TokenUserDbService tokenUserDbService;
    private final TokenRequestLogDbService tokenRequestLogDbService;

    public BillingPortalApplication(
            TokenUserDbService tokenUserDbService, TokenRequestLogDbService tokenRequestLogDbService) {
        this.tokenUserDbService = tokenUserDbService;
        this.tokenRequestLogDbService = tokenRequestLogDbService;
    }

    public BillingPortalMeResponse me(RechargeCaller caller) {
        TokenUser user = resolveUser(caller);
        BillingPortalMeResponse body = new BillingPortalMeResponse();
        String code = user != null ? user.getUserCode() : caller.getUserCode();
        body.setUserCode(code);
        body.setUserCodeMasked(maskUserCode(code));
        body.setStatus(user != null && user.getStatus() != null ? user.getStatus() : "active");
        body.setBalanceLi(user != null && user.getBalanceLi() != null ? user.getBalanceLi() : 0L);
        body.setExpiresIn(caller.remainingSeconds(Instant.now()));
        return body;
    }

    public BillingPortalUsageResponse listUsage(
            RechargeCaller caller, Integer limitRaw, String fromRaw, String toRaw, String cursorRaw) {
        int limit = normalizeLimit(limitRaw);
        Instant now = Instant.now();
        Instant to = parseInstantOr(toRaw, now, "invalid_time_range");
        Instant from = parseInstantOr(fromRaw, to.minus(Duration.ofDays(DEFAULT_WINDOW_DAYS)), "invalid_time_range");
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_time_range");
        }
        if (Duration.between(from, to).compareTo(Duration.ofDays(MAX_WINDOW_DAYS)) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_time_range");
        }

        Cursor cursor = decodeCursor(cursorRaw);

        BillingPortalUsageResponse empty = emptyUsage(from, to);
        TokenUser user = resolveUser(caller);
        Long userId = user != null ? user.getId() : caller.getUserId();
        if (userId == null) {
            return empty;
        }

        LocalDateTime fromLdt = LocalDateTime.ofInstant(from, ZoneOffset.UTC);
        LocalDateTime toLdt = LocalDateTime.ofInstant(to, ZoneOffset.UTC);
        LocalDateTime cursorT = cursor != null ? LocalDateTime.ofInstant(cursor.t(), ZoneOffset.UTC) : null;
        String cursorId = cursor != null ? cursor.id() : null;

        List<TokenRequestLog> rows = tokenRequestLogDbService.listForPortal(
                userId, fromLdt, toLdt, cursorT, cursorId, limit);

        BillingPortalUsageResponse body = new BillingPortalUsageResponse();
        body.setWindow(new BillingPortalUsageResponse.Window(from, to));
        List<BillingPortalUsageItem> items = new ArrayList<>(rows.size());
        for (TokenRequestLog row : rows) {
            items.add(toUsageItem(row));
        }
        body.setItems(items);
        if (rows.size() >= limit) {
            TokenRequestLog last = rows.get(rows.size() - 1);
            Instant lastAt = last.getCreatedAt() != null
                    ? last.getCreatedAt().toInstant(ZoneOffset.UTC)
                    : from;
            body.setNextCursor(encodeCursor(lastAt, last.getRequestId()));
        }
        return body;
    }

    private static BillingPortalUsageResponse emptyUsage(Instant from, Instant to) {
        BillingPortalUsageResponse body = new BillingPortalUsageResponse();
        body.setWindow(new BillingPortalUsageResponse.Window(from, to));
        body.setItems(List.of());
        body.setNextCursor(null);
        return body;
    }

    static BillingPortalUsageItem toUsageItem(TokenRequestLog row) {
        BillingPortalUsageItem item = new BillingPortalUsageItem();
        item.setRequestId(row.getRequestId());
        if (row.getCreatedAt() != null) {
            item.setCreatedAt(row.getCreatedAt().toInstant(ZoneOffset.UTC));
        }
        item.setModel(row.getModel());
        item.setKeyName(row.getKeyName());
        item.setStatus(row.getStatus());
        item.setBillingStatus(row.getBillingStatus());
        item.setPromptTokens(row.getPromptTokens());
        item.setCompletionTokens(row.getCompletionTokens());
        item.setChargeYuan(liToYuan(row.getRevenueLi()));
        item.setErrorSummary(row.getErrorSummary());
        return item;
    }

    /** 厘 → 元；null 保持 null（待结算）。 */
    static BigDecimal liToYuan(Long revenueLi) {
        if (revenueLi == null) {
            return null;
        }
        return BigDecimal.valueOf(revenueLi).divide(BigDecimal.valueOf(1000L), 3, RoundingMode.HALF_UP);
    }

    static int normalizeLimit(Integer limitRaw) {
        if (limitRaw == null) {
            return DEFAULT_USAGE_LIMIT;
        }
        if (limitRaw < 1 || limitRaw > MAX_USAGE_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_limit");
        }
        return limitRaw;
    }

    private static Instant parseInstantOr(String raw, Instant fallback, String reason) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return Instant.parse(raw.trim());
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
        }
    }

    record Cursor(Instant t, String id) {}

    static String encodeCursor(Instant t, String id) {
        String payload = t.toString() + "|" + id;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    static Cursor decodeCursor(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            String payload = new String(Base64.getUrlDecoder().decode(raw.trim()), StandardCharsets.UTF_8);
            int sep = payload.indexOf('|');
            if (sep <= 0 || sep >= payload.length() - 1) {
                throw new IllegalArgumentException("bad cursor");
            }
            Instant t = Instant.parse(payload.substring(0, sep));
            String id = payload.substring(sep + 1);
            if (id.isBlank()) {
                throw new IllegalArgumentException("bad cursor id");
            }
            return new Cursor(t, id);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_cursor");
        }
    }

    private TokenUser resolveUser(RechargeCaller caller) {
        TokenUser user = null;
        if (caller.getUserId() != null) {
            user = tokenUserDbService.getById(caller.getUserId());
        }
        if (user == null) {
            user = tokenUserDbService.findByTenantIdAndUserCode(
                    caller.getTenantId(), caller.getUserCode());
        }
        return user;
    }

    static String maskUserCode(String userCode) {
        if (userCode == null || userCode.isBlank()) {
            return "—";
        }
        String raw = userCode.trim();
        if (raw.length() <= 4) {
            return "****";
        }
        if (raw.length() <= 8) {
            return raw.substring(0, 2) + "****" + raw.substring(raw.length() - 2);
        }
        return raw.substring(0, 2) + "****" + raw.substring(raw.length() - 4);
    }
}
