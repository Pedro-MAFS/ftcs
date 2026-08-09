package com.mfs.tokengateway.admin.application;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.mfs.tokengateway.admin.api.dto.AdminLedgerListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminLedgerListResponse.AdminLedgerListItem;
import com.mfs.tokengateway.admin.api.dto.AdminRequestDetailResponse;
import com.mfs.tokengateway.admin.api.dto.AdminRequestDetailResponse.LedgerChargeSummary;
import com.mfs.tokengateway.admin.api.dto.AdminRequestListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminRequestListResponse.AdminRequestListItem;
import com.mfs.tokengateway.admin.api.dto.AdminTimeWindow;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.admin.domain.price.PriceEncoding;
import com.mfs.tokengateway.admin.utils.AdminMoney;
import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.db.po.TokenUser;

/** 消费请求日志 / charge 流水只读查询（US-G6-06）。 */
@Service
public class AdminUsageApplication {

    private static final int DEFAULT_PAGE = 1;
    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;
    private static final int DEFAULT_WINDOW_DAYS = 7;
    private static final int MAX_WINDOW_DAYS = 90;
    private static final int USER_CODE_LIKE_LIMIT = 200;

    private static final Set<String> BILLING_STATUSES = Set.of(
            TokenRequestLogDbService.BILLING_PENDING,
            TokenRequestLogDbService.BILLING_SETTLING,
            TokenRequestLogDbService.BILLING_CHARGED,
            TokenRequestLogDbService.BILLING_SKIPPED,
            TokenRequestLogDbService.BILLING_SETTLE_FAILED);

    private static final Set<String> REQUEST_STATUSES = Set.of("success", "error", "interrupted");

    private static final Set<String> LEDGER_TYPES = Set.of(
            TokenLedgerEntryDbService.TYPE_CHARGE,
            TokenLedgerEntryDbService.TYPE_TOPUP,
            TokenLedgerEntryDbService.TYPE_ADJUST);

    private final TokenRequestLogDbService requestLogDbService;
    private final TokenLedgerEntryDbService ledgerEntryDbService;
    private final TokenUserDbService tokenUserDbService;

    public AdminUsageApplication(
            TokenRequestLogDbService requestLogDbService,
            TokenLedgerEntryDbService ledgerEntryDbService,
            TokenUserDbService tokenUserDbService) {
        this.requestLogDbService = requestLogDbService;
        this.ledgerEntryDbService = ledgerEntryDbService;
        this.tokenUserDbService = tokenUserDbService;
    }

    public AdminRequestListResponse listRequests(
            Long userId,
            String q,
            String model,
            String billingStatus,
            String keyName,
            String status,
            String fromRaw,
            String toRaw,
            Integer pageRaw,
            Integer sizeRaw) {
        int page = normalizePage(pageRaw);
        int size = normalizeSize(sizeRaw);
        String normalizedBilling = normalizeOptionalEnum(billingStatus, BILLING_STATUSES, "billing_status");
        String normalizedStatus = normalizeOptionalEnum(status, REQUEST_STATUSES, "status");

        TimeWindow window = resolveWindow(fromRaw, toRaw);
        QResolve qResolve = resolveQ(q);

        if (qResolve.userCodeLikeEmpty()) {
            return emptyRequests(page, size, window);
        }

        IPage<TokenRequestLog> result = requestLogDbService.pageForAdmin(
                userId,
                qResolve.userIds(),
                qResolve.requestIdExact(),
                blankToNull(model),
                normalizedBilling,
                blankToNull(keyName),
                normalizedStatus,
                window.fromLdt(),
                window.toLdt(),
                qResolve.ignoreTimeWindow(),
                page,
                size);

        Map<Long, TokenUser> users = loadUsers(result.getRecords().stream()
                .map(TokenRequestLog::getUserId)
                .toList());

        AdminRequestListResponse resp = new AdminRequestListResponse();
        resp.setPage(page);
        resp.setSize(size);
        resp.setTotal(result.getTotal());
        resp.setWindow(window.toDto());
        List<AdminRequestListItem> items = new ArrayList<>();
        for (TokenRequestLog row : result.getRecords()) {
            items.add(toRequestListItem(row, users.get(row.getUserId())));
        }
        resp.setItems(items);
        return resp;
    }

    public AdminRequestListResponse listRequestsForUser(
            long userId,
            String q,
            String model,
            String billingStatus,
            String keyName,
            String status,
            String fromRaw,
            String toRaw,
            Integer pageRaw,
            Integer sizeRaw) {
        requireUser(userId);
        return listRequests(
                userId, q, model, billingStatus, keyName, status, fromRaw, toRaw, pageRaw, sizeRaw);
    }

    public AdminRequestDetailResponse getRequest(String requestId) {
        if (!StringUtils.hasText(requestId)) {
            throw AdminApiException.badRequest("validation_error", "request_id is required");
        }
        TokenRequestLog row = requestLogDbService.findByRequestId(requestId.trim());
        if (row == null) {
            throw AdminApiException.notFound("request_not_found", "request not found: " + requestId);
        }
        TokenUser user = row.getUserId() != null ? tokenUserDbService.getById(row.getUserId()) : null;
        TokenLedgerEntry charge = ledgerEntryDbService.findByRequestId(row.getRequestId());
        return toRequestDetail(row, user, charge);
    }

    public AdminLedgerListResponse listLedger(
            Long userId,
            String typeRaw,
            String requestId,
            String operator,
            String fromRaw,
            String toRaw,
            Integer pageRaw,
            Integer sizeRaw) {
        int page = normalizePage(pageRaw);
        int size = normalizeSize(sizeRaw);
        String typeExact = normalizeLedgerType(typeRaw);
        TimeWindow window = resolveWindow(fromRaw, toRaw);

        IPage<TokenLedgerEntry> result = ledgerEntryDbService.pageForAdmin(
                userId,
                null,
                typeExact,
                blankToNull(requestId),
                blankToNull(operator),
                window.fromLdt(),
                window.toLdt(),
                page,
                size);

        Map<Long, TokenUser> users = loadUsers(result.getRecords().stream()
                .map(TokenLedgerEntry::getUserId)
                .toList());

        AdminLedgerListResponse resp = new AdminLedgerListResponse();
        resp.setPage(page);
        resp.setSize(size);
        resp.setTotal(result.getTotal());
        resp.setWindow(window.toDto());
        List<AdminLedgerListItem> items = new ArrayList<>();
        for (TokenLedgerEntry row : result.getRecords()) {
            items.add(toLedgerItem(row, users.get(row.getUserId())));
        }
        resp.setItems(items);
        return resp;
    }

    public AdminLedgerListResponse listLedgerForUser(
            long userId,
            String typeRaw,
            String requestId,
            String operator,
            String fromRaw,
            String toRaw,
            Integer pageRaw,
            Integer sizeRaw) {
        requireUser(userId);
        return listLedger(userId, typeRaw, requestId, operator, fromRaw, toRaw, pageRaw, sizeRaw);
    }

    private TokenUser requireUser(long userId) {
        TokenUser user = tokenUserDbService.getById(userId);
        if (user == null) {
            throw AdminApiException.notFound("user_not_found", "user not found: " + userId);
        }
        return user;
    }

    private AdminRequestListResponse emptyRequests(int page, int size, TimeWindow window) {
        AdminRequestListResponse resp = new AdminRequestListResponse();
        resp.setPage(page);
        resp.setSize(size);
        resp.setTotal(0);
        resp.setWindow(window.toDto());
        resp.setItems(List.of());
        return resp;
    }

    private QResolve resolveQ(String raw) {
        if (!StringUtils.hasText(raw)) {
            return QResolve.none();
        }
        String q = raw.trim();
        if (looksLikeRequestId(q)) {
            return QResolve.requestId(q);
        }
        List<TokenUser> matched = tokenUserDbService.findByUserCodeLike(q, USER_CODE_LIKE_LIMIT + 1);
        if (matched.size() > USER_CODE_LIKE_LIMIT) {
            throw AdminApiException.badRequest(
                    "query_too_broad", "user_code query matched too many users; narrow q");
        }
        if (matched.isEmpty()) {
            return QResolve.emptyUserCode();
        }
        List<Long> ids = matched.stream().map(TokenUser::getId).toList();
        return QResolve.userIds(ids);
    }

    static boolean looksLikeRequestId(String q) {
        if (q.length() < 8 || q.chars().anyMatch(Character::isWhitespace)) {
            return false;
        }
        // ULID / UUID-ish：字母数字与 -_
        return q.chars().allMatch(c -> Character.isLetterOrDigit(c) || c == '-' || c == '_');
    }

    private TimeWindow resolveWindow(String fromRaw, String toRaw) {
        Instant to = parseInstant(toRaw, "to");
        if (to == null) {
            to = Instant.now();
        }
        Instant from = parseInstant(fromRaw, "from");
        if (from == null) {
            from = to.minus(Duration.ofDays(DEFAULT_WINDOW_DAYS));
        }
        if (to.isBefore(from)) {
            throw AdminApiException.badRequest("invalid_time_range", "to must be >= from");
        }
        long days = Duration.between(from, to).toDays();
        if (days > MAX_WINDOW_DAYS) {
            throw AdminApiException.badRequest(
                    "invalid_time_range", "time range must be <= " + MAX_WINDOW_DAYS + " days");
        }
        return new TimeWindow(from, to);
    }

    private static Instant parseInstant(String raw, String field) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return Instant.parse(raw.trim());
        } catch (Exception e) {
            throw AdminApiException.badRequest(
                    "invalid_time_range", field + " must be ISO-8601 instant");
        }
    }

    static String normalizeLedgerType(String raw) {
        if (!StringUtils.hasText(raw) || "charge".equalsIgnoreCase(raw.trim())) {
            return TokenLedgerEntryDbService.TYPE_CHARGE;
        }
        String t = raw.trim().toLowerCase(Locale.ROOT);
        if ("all".equals(t)) {
            return null;
        }
        if (TokenLedgerEntryDbService.TYPE_FILTER_CREDITS.equals(t)) {
            return TokenLedgerEntryDbService.TYPE_FILTER_CREDITS;
        }
        if (!LEDGER_TYPES.contains(t)) {
            throw AdminApiException.badRequest(
                    "validation_error",
                    "type must be charge, topup, adjust, credits, or all");
        }
        return t;
    }

    static String normalizeOptionalEnum(String raw, Set<String> allowed, String field) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String v = raw.trim().toLowerCase(Locale.ROOT);
        if (!allowed.contains(v)) {
            throw AdminApiException.badRequest(
                    "validation_error", field + " is invalid");
        }
        return v;
    }

    static int normalizePage(Integer pageRaw) {
        if (pageRaw == null) {
            return DEFAULT_PAGE;
        }
        if (pageRaw < 1) {
            throw AdminApiException.badRequest("validation_error", "page must be >= 1");
        }
        return pageRaw;
    }

    static int normalizeSize(Integer sizeRaw) {
        if (sizeRaw == null) {
            return DEFAULT_SIZE;
        }
        if (sizeRaw < 1 || sizeRaw > MAX_SIZE) {
            throw AdminApiException.badRequest(
                    "validation_error", "size must be between 1 and " + MAX_SIZE);
        }
        return sizeRaw;
    }

    private Map<Long, TokenUser> loadUsers(List<Long> userIds) {
        Set<Long> ids = new HashSet<>();
        for (Long id : userIds) {
            if (id != null) {
                ids.add(id);
            }
        }
        Map<Long, TokenUser> map = new HashMap<>();
        for (TokenUser u : tokenUserDbService.listByIds(ids)) {
            map.put(u.getId(), u);
        }
        return map;
    }

    private static AdminRequestListItem toRequestListItem(TokenRequestLog row, TokenUser user) {
        AdminRequestListItem item = new AdminRequestListItem();
        item.setRequestId(row.getRequestId());
        item.setCreatedAt(toInstant(row.getCreatedAt()));
        item.setUserId(row.getUserId());
        if (user != null) {
            item.setUserCode(user.getUserCode());
            item.setTenantId(user.getTenantId());
        }
        item.setKeyName(row.getKeyName());
        item.setModel(row.getModel());
        item.setStatus(row.getStatus());
        item.setBillingStatus(row.getBillingStatus());
        item.setPromptTokens(row.getPromptTokens());
        item.setCompletionTokens(row.getCompletionTokens());
        item.setRevenueLi(row.getRevenueLi());
        item.setRevenueYuan(AdminMoney.liToYuan(row.getRevenueLi()));
        item.setLatencyMs(row.getLatencyMs());
        item.setErrorSummary(row.getErrorSummary());
        return item;
    }

    private static AdminRequestDetailResponse toRequestDetail(
            TokenRequestLog row, TokenUser user, TokenLedgerEntry charge) {
        AdminRequestDetailResponse d = new AdminRequestDetailResponse();
        d.setRequestId(row.getRequestId());
        d.setCreatedAt(toInstant(row.getCreatedAt()));
        d.setUserId(row.getUserId());
        if (user != null) {
            d.setUserCode(user.getUserCode());
            d.setTenantId(user.getTenantId());
        }
        d.setKeyId(row.getKeyId());
        d.setKeyName(row.getKeyName());
        d.setModel(row.getModel());
        d.setStatus(row.getStatus());
        d.setBillingStatus(row.getBillingStatus());
        d.setPromptTokens(row.getPromptTokens());
        d.setCompletionTokens(row.getCompletionTokens());
        d.setCachedTokens(row.getCachedTokens());
        d.setUncachedTokens(row.getUncachedTokens());
        d.setRevenueLi(row.getRevenueLi());
        d.setRevenueYuan(AdminMoney.liToYuan(row.getRevenueLi()));
        d.setCogsLi(row.getCogsLi());
        d.setCogsYuan(AdminMoney.liToYuan(row.getCogsLi()));
        d.setMarginLi(row.getMarginLi());
        d.setMarginYuan(AdminMoney.liToYuan(row.getMarginLi()));
        d.setLatencyMs(row.getLatencyMs());
        d.setUpstreamStatus(row.getUpstreamStatus());
        d.setErrorSummary(row.getErrorSummary());
        d.setSettleOwner(row.getSettleOwner());
        d.setSettleClaimedAt(toInstant(row.getSettleClaimedAt()));
        if (charge != null) {
            LedgerChargeSummary s = new LedgerChargeSummary();
            s.setId(charge.getId());
            s.setAmountLi(charge.getAmountLi());
            s.setAmountYuan(AdminMoney.liToYuan(charge.getAmountLi()));
            s.setBalanceAfterLi(charge.getBalanceAfterLi());
            s.setCreatedAt(toInstant(charge.getCreatedAt()));
            d.setLedgerCharge(s);
        }
        return d;
    }

    private static AdminLedgerListItem toLedgerItem(TokenLedgerEntry row, TokenUser user) {
        AdminLedgerListItem item = new AdminLedgerListItem();
        item.setId(row.getId());
        item.setUserId(row.getUserId());
        if (user != null) {
            item.setUserCode(user.getUserCode());
            item.setTenantId(user.getTenantId());
        }
        item.setType(row.getType());
        item.setAmountLi(row.getAmountLi());
        item.setAmountYuan(AdminMoney.liToYuan(row.getAmountLi()));
        item.setBalanceAfterLi(row.getBalanceAfterLi());
        item.setBalanceAfterYuan(AdminMoney.liToYuan(row.getBalanceAfterLi()));
        item.setRequestId(row.getRequestId());
        item.setNote(row.getNote());
        item.setOperator(row.getOperator());
        item.setSource(AdminAdjustmentApplication.resolveSource(row.getType(), row.getOperator()));
        item.setCreatedAt(toInstant(row.getCreatedAt()));
        return item;
    }

    private static Instant toInstant(LocalDateTime utc) {
        return PriceEncoding.toInstant(utc);
    }

    private static String blankToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private record TimeWindow(Instant from, Instant to) {
        LocalDateTime fromLdt() {
            return LocalDateTime.ofInstant(from, ZoneOffset.UTC);
        }

        LocalDateTime toLdt() {
            return LocalDateTime.ofInstant(to, ZoneOffset.UTC);
        }

        AdminTimeWindow toDto() {
            return new AdminTimeWindow(from, to);
        }
    }

    private record QResolve(
            String requestIdExact, List<Long> userIds, boolean ignoreTimeWindow, boolean userCodeLikeEmpty) {
        static QResolve none() {
            return new QResolve(null, null, false, false);
        }

        static QResolve requestId(String id) {
            return new QResolve(id, null, true, false);
        }

        static QResolve userIds(List<Long> ids) {
            return new QResolve(null, ids, false, false);
        }

        static QResolve emptyUserCode() {
            return new QResolve(null, null, false, true);
        }
    }
}
