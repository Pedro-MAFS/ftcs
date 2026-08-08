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

import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenPriceRuleDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenPriceRule;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.api.dto.BillingPortalKeysResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalKeysResponse.BillingPortalKeyItem;
import com.mfs.tokengateway.server.api.dto.BillingPortalMeResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalPricesResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalPricesResponse.BillingPortalPriceItem;
import com.mfs.tokengateway.server.api.dto.BillingPortalTopupsResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalTopupsResponse.BillingPortalTopupItem;
import com.mfs.tokengateway.server.api.dto.BillingPortalUsageResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalUsageResponse.BillingPortalUsageItem;
import com.mfs.tokengateway.server.api.dto.KeyRotateResponse;
import com.mfs.tokengateway.server.metering.SearchBilling;
import com.mfs.tokengateway.server.security.RechargeCaller;
import com.mfs.tokengateway.server.security.UcIdentity;
import com.mfs.tokengateway.server.upstream.ModelWhitelist;

/** 用户面板查询与 Key 管理（US-G4-02～05 / G4-08 / G5-04）。 */
@Service
public class BillingPortalApplication {

    static final int DEFAULT_USAGE_LIMIT = 20;
    static final int MAX_USAGE_LIMIT = 50;
    static final int DEFAULT_WINDOW_DAYS = 30;
    static final int MAX_WINDOW_DAYS = 90;
    static final String PORTAL_CLIENT_ID = "billing-portal";

    private final TokenUserDbService tokenUserDbService;
    private final TokenRequestLogDbService tokenRequestLogDbService;
    private final TokenWechatPayOrderDbService tokenWechatPayOrderDbService;
    private final TokenPriceRuleDbService tokenPriceRuleDbService;
    private final TokenApiKeyDbService tokenApiKeyDbService;
    private final ModelWhitelist modelWhitelist;
    private final KeyRotateApplication keyRotateApplication;

    public BillingPortalApplication(
            TokenUserDbService tokenUserDbService,
            TokenRequestLogDbService tokenRequestLogDbService,
            TokenWechatPayOrderDbService tokenWechatPayOrderDbService,
            TokenPriceRuleDbService tokenPriceRuleDbService,
            TokenApiKeyDbService tokenApiKeyDbService,
            ModelWhitelist modelWhitelist,
            KeyRotateApplication keyRotateApplication) {
        this.tokenUserDbService = tokenUserDbService;
        this.tokenRequestLogDbService = tokenRequestLogDbService;
        this.tokenWechatPayOrderDbService = tokenWechatPayOrderDbService;
        this.tokenPriceRuleDbService = tokenPriceRuleDbService;
        this.tokenApiKeyDbService = tokenApiKeyDbService;
        this.modelWhitelist = modelWhitelist;
        this.keyRotateApplication = keyRotateApplication;
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
        TimeWindow window = resolveTimeWindow(fromRaw, toRaw);
        Cursor cursor = decodeCursor(cursorRaw);

        BillingPortalUsageResponse empty = emptyUsage(window.from(), window.to());
        Long userId = resolveUserId(caller);
        if (userId == null) {
            return empty;
        }

        LocalDateTime fromLdt = LocalDateTime.ofInstant(window.from(), ZoneOffset.UTC);
        LocalDateTime toLdt = LocalDateTime.ofInstant(window.to(), ZoneOffset.UTC);
        LocalDateTime cursorT = cursor != null ? LocalDateTime.ofInstant(cursor.t(), ZoneOffset.UTC) : null;
        String cursorId = cursor != null ? cursor.id() : null;

        List<TokenRequestLog> rows = tokenRequestLogDbService.listForPortal(
                userId, fromLdt, toLdt, cursorT, cursorId, limit);

        BillingPortalUsageResponse body = new BillingPortalUsageResponse();
        body.setWindow(new BillingPortalUsageResponse.Window(window.from(), window.to()));
        List<BillingPortalUsageItem> items = new ArrayList<>(rows.size());
        for (TokenRequestLog row : rows) {
            items.add(toUsageItem(row));
        }
        body.setItems(items);
        if (rows.size() >= limit) {
            TokenRequestLog last = rows.get(rows.size() - 1);
            Instant lastAt = last.getCreatedAt() != null
                    ? last.getCreatedAt().toInstant(ZoneOffset.UTC)
                    : window.from();
            body.setNextCursor(encodeCursor(lastAt, last.getRequestId()));
        }
        return body;
    }

    public BillingPortalTopupsResponse listTopups(
            RechargeCaller caller, Integer limitRaw, String fromRaw, String toRaw, String cursorRaw) {
        int limit = normalizeLimit(limitRaw);
        TimeWindow window = resolveTimeWindow(fromRaw, toRaw);
        Cursor cursor = decodeCursor(cursorRaw);
        Long cursorOrderId = parseCursorLongId(cursor);

        BillingPortalTopupsResponse empty = emptyTopups(window.from(), window.to());
        Long userId = resolveUserId(caller);
        if (userId == null) {
            return empty;
        }

        LocalDateTime fromLdt = LocalDateTime.ofInstant(window.from(), ZoneOffset.UTC);
        LocalDateTime toLdt = LocalDateTime.ofInstant(window.to(), ZoneOffset.UTC);
        LocalDateTime cursorT = cursor != null ? LocalDateTime.ofInstant(cursor.t(), ZoneOffset.UTC) : null;

        List<TokenWechatPayOrder> rows = tokenWechatPayOrderDbService.listForPortal(
                userId, fromLdt, toLdt, cursorT, cursorOrderId, limit);

        BillingPortalTopupsResponse body = new BillingPortalTopupsResponse();
        body.setWindow(new BillingPortalTopupsResponse.Window(window.from(), window.to()));
        List<BillingPortalTopupItem> items = new ArrayList<>(rows.size());
        for (TokenWechatPayOrder row : rows) {
            items.add(toTopupItem(row));
        }
        body.setItems(items);
        if (rows.size() >= limit) {
            TokenWechatPayOrder last = rows.get(rows.size() - 1);
            Instant lastAt = last.getCreatedAt() != null
                    ? last.getCreatedAt().toInstant(ZoneOffset.UTC)
                    : window.from();
            body.setNextCursor(encodeCursor(lastAt, String.valueOf(last.getId())));
        }
        return body;
    }

    public BillingPortalPricesResponse listPrices(RechargeCaller caller) {
        if (caller == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_recharge_ticket");
        }
        Instant asOf = Instant.now();
        LocalDateTime asOfLdt = LocalDateTime.ofInstant(asOf, ZoneOffset.UTC);
        List<BillingPortalPriceItem> items = new ArrayList<>();
        for (String model : modelWhitelist.listSorted()) {
            TokenPriceRule rule = tokenPriceRuleDbService.findEffective(model, asOfLdt);
            if (rule == null) {
                continue;
            }
            items.add(toPriceItem(rule));
        }
        TokenPriceRule searchRule = tokenPriceRuleDbService.findEffective(SearchBilling.MODEL, asOfLdt);
        if (searchRule != null) {
            items.add(toPerCallPriceItem(searchRule));
        }
        BillingPortalPricesResponse body = new BillingPortalPricesResponse();
        body.setAsOf(asOf);
        body.setItems(items);
        return body;
    }

    public BillingPortalKeysResponse listKeys(RechargeCaller caller) {
        BillingPortalKeysResponse body = new BillingPortalKeysResponse();
        Long userId = resolveUserId(caller);
        if (userId == null) {
            body.setItems(List.of());
            return body;
        }
        List<TokenApiKey> rows = tokenApiKeyDbService.listByUserId(userId);
        List<BillingPortalKeyItem> items = new ArrayList<>(rows.size());
        for (TokenApiKey row : rows) {
            items.add(toKeyItem(row));
        }
        body.setItems(items);
        return body;
    }

    public KeyRotateResponse rotateKey(RechargeCaller caller, String rawName) {
        if (caller == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_recharge_ticket");
        }
        // 面板本期仅允许重置已有 name，不开放新增（桌面 JWT rotate 仍可创建）。
        String name = KeyNameRules.normalizeAndValidate(rawName);
        Long userId = resolveUserId(caller);
        if (userId == null || tokenApiKeyDbService.findByUserIdAndName(userId, name) == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "key_not_found");
        }
        return keyRotateApplication.rotate(toUcIdentity(caller), name);
    }

    private Long resolveUserId(RechargeCaller caller) {
        TokenUser user = resolveUser(caller);
        if (user != null) {
            return user.getId();
        }
        return caller.getUserId();
    }

    private static TimeWindow resolveTimeWindow(String fromRaw, String toRaw) {
        Instant now = Instant.now();
        Instant to = parseInstantOr(toRaw, now, "invalid_time_range");
        Instant from = parseInstantOr(fromRaw, to.minus(Duration.ofDays(DEFAULT_WINDOW_DAYS)), "invalid_time_range");
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_time_range");
        }
        if (Duration.between(from, to).compareTo(Duration.ofDays(MAX_WINDOW_DAYS)) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_time_range");
        }
        return new TimeWindow(from, to);
    }

    private static Long parseCursorLongId(Cursor cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            return Long.parseLong(cursor.id());
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_cursor");
        }
    }

    private static BillingPortalUsageResponse emptyUsage(Instant from, Instant to) {
        BillingPortalUsageResponse body = new BillingPortalUsageResponse();
        body.setWindow(new BillingPortalUsageResponse.Window(from, to));
        body.setItems(List.of());
        body.setNextCursor(null);
        return body;
    }

    private static BillingPortalTopupsResponse emptyTopups(Instant from, Instant to) {
        BillingPortalTopupsResponse body = new BillingPortalTopupsResponse();
        body.setWindow(new BillingPortalTopupsResponse.Window(from, to));
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

    static BillingPortalTopupItem toTopupItem(TokenWechatPayOrder row) {
        BillingPortalTopupItem item = new BillingPortalTopupItem();
        item.setOutTradeNo(row.getOutTradeNo());
        if (row.getCreatedAt() != null) {
            item.setCreatedAt(row.getCreatedAt().toInstant(ZoneOffset.UTC));
        }
        if (row.getPaidAt() != null) {
            item.setPaidAt(row.getPaidAt().toInstant(ZoneOffset.UTC));
        }
        if (row.getCreditedAt() != null) {
            item.setCreditedAt(row.getCreditedAt().toInstant(ZoneOffset.UTC));
        }
        item.setAmountYuan(liToYuan(row.getAmountLi()));
        item.setStatus(row.getStatus());
        item.setDescription(row.getDescription());
        item.setWxTransactionId(row.getWxTransactionId());
        String status = row.getStatus() == null ? "" : row.getStatus().toLowerCase();
        if ("failed".equals(status) || "closed".equals(status)) {
            item.setFailReason(row.getFailReason());
        } else {
            item.setFailReason(null);
        }
        return item;
    }

    static BillingPortalPriceItem toPriceItem(TokenPriceRule row) {
        BillingPortalPriceItem item = new BillingPortalPriceItem();
        item.setModel(row.getModel());
        item.setBillingUnit(BillingPortalPricesResponse.BILLING_UNIT_PER_MTOK);
        long inputUser = nz(row.getInputPriceLiPerMTok());
        long outputUser = nz(row.getOutputPriceLiPerMTok());
        long inputUp = nz(row.getUpstreamInputCostLiPerMTok());
        long outputUp = nz(row.getUpstreamOutputCostLiPerMTok());
        item.setInputPriceYuanPerMtok(liToYuan(inputUser));
        item.setOutputPriceYuanPerMtok(liToYuan(outputUser));
        // 仅用户价严格低于上游时展示划线原价（营销「赚到了」；不暴露 upstream_* 字段名）
        if (inputUser < inputUp) {
            item.setListInputPriceYuanPerMtok(liToYuan(inputUp));
        }
        if (outputUser < outputUp) {
            item.setListOutputPriceYuanPerMtok(liToYuan(outputUp));
        }
        if (row.getEffectiveFrom() != null) {
            item.setEffectiveFrom(row.getEffectiveFrom().toInstant(ZoneOffset.UTC));
        }
        return item;
    }

    /** 搜索按次价：方案 A 解码后元/次；优惠时附带 list 划线原价。 */
    static BillingPortalPriceItem toPerCallPriceItem(TokenPriceRule row) {
        BillingPortalPriceItem item = new BillingPortalPriceItem();
        item.setModel(row.getModel());
        item.setBillingUnit(BillingPortalPricesResponse.BILLING_UNIT_PER_CALL);
        long userLiPerCall = SearchBilling.decodeLiPerCall(nz(row.getInputPriceLiPerMTok()));
        long upstreamLiPerCall = SearchBilling.decodeLiPerCall(nz(row.getUpstreamInputCostLiPerMTok()));
        item.setPriceYuanPerCall(liToYuan(userLiPerCall));
        if (userLiPerCall < upstreamLiPerCall) {
            item.setListPriceYuanPerCall(liToYuan(upstreamLiPerCall));
        }
        if (row.getEffectiveFrom() != null) {
            item.setEffectiveFrom(row.getEffectiveFrom().toInstant(ZoneOffset.UTC));
        }
        return item;
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }

    static BillingPortalKeyItem toKeyItem(TokenApiKey row) {
        BillingPortalKeyItem item = new BillingPortalKeyItem();
        item.setName(row.getName());
        item.setKeyPrefix(row.getKeyPrefix());
        item.setStatus(row.getStatus());
        if (row.getCreatedAt() != null) {
            item.setCreatedAt(row.getCreatedAt().toInstant(ZoneOffset.UTC));
        }
        if (row.getUpdatedAt() != null) {
            item.setUpdatedAt(row.getUpdatedAt().toInstant(ZoneOffset.UTC));
        }
        if (row.getLastUsedAt() != null) {
            item.setLastUsedAt(row.getLastUsedAt().toInstant(ZoneOffset.UTC));
        }
        return item;
    }

    static UcIdentity toUcIdentity(RechargeCaller caller) {
        return new UcIdentity(
                caller.getTenantId(),
                caller.getUserCode(),
                caller.getUserCode(),
                PORTAL_CLIENT_ID);
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

    record TimeWindow(Instant from, Instant to) {}

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
