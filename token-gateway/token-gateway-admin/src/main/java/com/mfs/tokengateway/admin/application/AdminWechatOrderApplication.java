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
import com.mfs.tokengateway.admin.api.dto.AdminTimeWindow;
import com.mfs.tokengateway.admin.api.dto.AdminWechatOrderListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminWechatOrderListResponse.AdminWechatOrderListItem;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.admin.utils.AdminMoney;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;

/** 微信充值订单只读查询（US-G6-11）。 */
@Service
public class AdminWechatOrderApplication {

    private static final int DEFAULT_PAGE = 1;
    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;
    private static final int DEFAULT_WINDOW_DAYS = 7;
    private static final int MAX_WINDOW_DAYS = 90;

    private static final Set<String> ORDER_STATUSES =
            Set.of("created", "paid", "credited", "failed", "closed");

    private final TokenWechatPayOrderDbService orderDbService;
    private final TokenUserDbService tokenUserDbService;

    public AdminWechatOrderApplication(
            TokenWechatPayOrderDbService orderDbService, TokenUserDbService tokenUserDbService) {
        this.orderDbService = orderDbService;
        this.tokenUserDbService = tokenUserDbService;
    }

    public AdminWechatOrderListResponse listOrders(
            Long userId,
            String statusRaw,
            String outTradeNo,
            String fromRaw,
            String toRaw,
            Integer pageRaw,
            Integer sizeRaw) {
        int page = normalizePage(pageRaw);
        int size = normalizeSize(sizeRaw);
        String status = normalizeStatus(statusRaw);
        String tradeNo = StringUtils.hasText(outTradeNo) ? outTradeNo.trim() : null;
        TimeWindow window = resolveWindow(fromRaw, toRaw);

        IPage<TokenWechatPayOrder> result = orderDbService.pageForAdmin(
                userId,
                status,
                tradeNo,
                LocalDateTime.ofInstant(window.from(), ZoneOffset.UTC),
                LocalDateTime.ofInstant(window.to(), ZoneOffset.UTC),
                page,
                size);

        List<TokenWechatPayOrder> rows =
                result.getRecords() != null ? result.getRecords() : List.of();
        Map<Long, TokenUser> users = loadUsers(rows.stream().map(TokenWechatPayOrder::getUserId).toList());

        List<AdminWechatOrderListItem> items = new ArrayList<>();
        for (TokenWechatPayOrder row : rows) {
            items.add(toItem(row, users.get(row.getUserId())));
        }

        AdminWechatOrderListResponse resp = new AdminWechatOrderListResponse();
        resp.setPage(page);
        resp.setSize(size);
        resp.setTotal(result.getTotal());
        resp.setWindow(new AdminTimeWindow(window.from(), window.to()));
        resp.setItems(items);
        return resp;
    }

    static AdminWechatOrderListItem toItem(TokenWechatPayOrder row, TokenUser user) {
        AdminWechatOrderListItem item = new AdminWechatOrderListItem();
        item.setId(row.getId());
        item.setUserId(row.getUserId());
        if (user != null) {
            item.setUserCode(user.getUserCode());
            item.setTenantId(user.getTenantId());
        } else {
            item.setUserCode(row.getUserCode());
            item.setTenantId(row.getTenantId());
        }
        item.setOutTradeNo(row.getOutTradeNo());
        item.setStatus(row.getStatus());
        item.setAmountYuan(AdminMoney.liToYuan(row.getAmountLi()));
        item.setWxTransactionId(row.getWxTransactionId());
        item.setLedgerRequestId(toLedgerRequestId(row.getWxTransactionId()));
        item.setFailReason(row.getFailReason());
        item.setDescription(row.getDescription());
        item.setCreatedAt(toInstant(row.getCreatedAt()));
        item.setPaidAt(toInstant(row.getPaidAt()));
        item.setCreditedAt(toInstant(row.getCreditedAt()));
        item.setLastNotifyTradeState(row.getLastNotifyTradeState());
        item.setLastNotifyResult(row.getLastNotifyResult());
        item.setLastSyncTradeState(row.getLastSyncTradeState());
        item.setLastSyncResult(row.getLastSyncResult());
        return item;
    }

    static String toLedgerRequestId(String wxTransactionId) {
        if (!StringUtils.hasText(wxTransactionId)) {
            return null;
        }
        return "wechat:" + wxTransactionId.trim();
    }

    static String normalizeStatus(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String v = raw.trim().toLowerCase(Locale.ROOT);
        if (!ORDER_STATUSES.contains(v)) {
            throw AdminApiException.badRequest(
                    "validation_error",
                    "status must be created, paid, credited, failed, or closed");
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

    private Map<Long, TokenUser> loadUsers(List<Long> userIds) {
        Set<Long> ids = new HashSet<>();
        for (Long id : userIds) {
            if (id != null) {
                ids.add(id);
            }
        }
        Map<Long, TokenUser> map = new HashMap<>();
        if (ids.isEmpty()) {
            return map;
        }
        for (TokenUser u : tokenUserDbService.listByIds(ids)) {
            map.put(u.getId(), u);
        }
        return map;
    }

    private static Instant toInstant(LocalDateTime ldt) {
        if (ldt == null) {
            return null;
        }
        return ldt.toInstant(ZoneOffset.UTC);
    }

    private record TimeWindow(Instant from, Instant to) {}
}
