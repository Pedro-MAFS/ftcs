package com.mfs.tokengateway.admin.application;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.mfs.tokengateway.admin.api.dto.AdminUserDetailResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserListResponse.AdminUserListItem;
import com.mfs.tokengateway.admin.api.dto.AdminUserStatusUpdateRequest;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.admin.domain.price.PriceEncoding;
import com.mfs.tokengateway.admin.utils.AdminMoney;
import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService.KeyStatusCounts;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenUser;

/** 用户列表 / 详情 / 启停（US-G6-04）。 */
@Service
public class AdminUserApplication {

    private static final Logger log = LoggerFactory.getLogger(AdminUserApplication.class);

    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_DISABLED = "disabled";

    private static final int DEFAULT_PAGE = 1;
    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;

    private final TokenUserDbService tokenUserDbService;
    private final TokenApiKeyDbService tokenApiKeyDbService;

    public AdminUserApplication(
            TokenUserDbService tokenUserDbService, TokenApiKeyDbService tokenApiKeyDbService) {
        this.tokenUserDbService = tokenUserDbService;
        this.tokenApiKeyDbService = tokenApiKeyDbService;
    }

    public AdminUserListResponse list(
            String q,
            String status,
            String tenantId,
            String userCode,
            Integer pageRaw,
            Integer sizeRaw) {
        int page = normalizePage(pageRaw);
        int size = normalizeSize(sizeRaw);
        String normalizedStatus = normalizeOptionalStatus(status);

        IPage<TokenUser> result = tokenUserDbService.pageUsers(
                q, normalizedStatus, tenantId, userCode, page, size);

        AdminUserListResponse resp = new AdminUserListResponse();
        resp.setPage(page);
        resp.setSize(size);
        resp.setTotal(result.getTotal());
        List<AdminUserListItem> items = new ArrayList<>();
        for (TokenUser row : result.getRecords()) {
            items.add(toListItem(row));
        }
        resp.setItems(items);
        return resp;
    }

    public AdminUserDetailResponse get(long userId) {
        TokenUser user = requireUser(userId);
        return toDetail(user);
    }

    public AdminUserDetailResponse updateStatus(
            long userId, AdminUserStatusUpdateRequest req, String clientInfo) {
        if (req.getOperator() == null || req.getOperator().isBlank()) {
            throw AdminApiException.badRequest("validation_error", "operator is required");
        }
        if (req.getNote() == null || req.getNote().isBlank()) {
            throw AdminApiException.badRequest("validation_error", "note is required");
        }
        String toStatus = requireStatus(req.getStatus());

        TokenUser user = requireUser(userId);
        String fromStatus = user.getStatus();
        boolean noop = toStatus.equals(fromStatus);

        if (!noop) {
            boolean ok = tokenUserDbService.updateStatus(userId, toStatus);
            if (!ok) {
                throw AdminApiException.notFound("user_not_found", "user not found: " + userId);
            }
            user = requireUser(userId);
        }

        log.info(
                "AUDIT user_status operator={} note={} user_id={} user_code={} tenant_id={} "
                        + "from_status={} to_status={} noop={} client={}",
                req.getOperator().trim(),
                req.getNote().trim(),
                user.getId(),
                user.getUserCode(),
                user.getTenantId(),
                fromStatus,
                toStatus,
                noop,
                clientInfo != null ? clientInfo : "-");

        return toDetail(user);
    }

    private TokenUser requireUser(long userId) {
        TokenUser user = tokenUserDbService.getById(userId);
        if (user == null) {
            throw AdminApiException.notFound("user_not_found", "user not found: " + userId);
        }
        return user;
    }

    private AdminUserListItem toListItem(TokenUser row) {
        AdminUserListItem item = new AdminUserListItem();
        item.setId(row.getId());
        item.setTenantId(row.getTenantId());
        item.setUserCode(row.getUserCode());
        long balance = row.getBalanceLi() != null ? row.getBalanceLi() : 0L;
        item.setBalanceLi(balance);
        item.setBalanceYuan(AdminMoney.liToYuan(balance));
        item.setStatus(row.getStatus());
        item.setCreatedAt(toInstant(row.getCreatedAt()));
        item.setUpdatedAt(toInstant(row.getUpdatedAt()));
        return item;
    }

    private AdminUserDetailResponse toDetail(TokenUser row) {
        AdminUserDetailResponse detail = new AdminUserDetailResponse();
        detail.setId(row.getId());
        detail.setTenantId(row.getTenantId());
        detail.setUserCode(row.getUserCode());
        long balance = row.getBalanceLi() != null ? row.getBalanceLi() : 0L;
        detail.setBalanceLi(balance);
        detail.setBalanceYuan(AdminMoney.liToYuan(balance));
        detail.setStatus(row.getStatus());
        detail.setRpmLimit(row.getRpmLimit());
        detail.setTpmLimit(row.getTpmLimit());
        detail.setDailyLimitLi(row.getDailyLimitLi());
        detail.setCreatedAt(toInstant(row.getCreatedAt()));
        detail.setUpdatedAt(toInstant(row.getUpdatedAt()));

        KeyStatusCounts counts = tokenApiKeyDbService.countByUserId(row.getId());
        detail.setKeyTotal(counts.total());
        detail.setKeyActive(counts.active());
        detail.setKeyDisabled(counts.disabled());
        return detail;
    }

    static String requireStatus(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw AdminApiException.badRequest("validation_error", "status is required");
        }
        String s = raw.trim().toLowerCase(Locale.ROOT);
        if (!STATUS_ACTIVE.equals(s) && !STATUS_DISABLED.equals(s)) {
            throw AdminApiException.badRequest(
                    "validation_error", "status must be active or disabled");
        }
        return s;
    }

    static String normalizeOptionalStatus(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        return requireStatus(raw);
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

    private static java.time.Instant toInstant(LocalDateTime utc) {
        return PriceEncoding.toInstant(utc);
    }
}
