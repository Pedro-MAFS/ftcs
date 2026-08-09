package com.mfs.tokengateway.admin.application;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.mfs.tokengateway.admin.api.dto.AdminUserKeyListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyListResponse.AdminUserKeyItem;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyRotateRequest;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyRotateResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyStatusUpdateRequest;
import com.mfs.tokengateway.admin.config.GatewayKeyProperties;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.admin.domain.price.PriceEncoding;
import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.security.GatewayApiKeyGenerator;
import com.mfs.tokengateway.db.security.GatewayApiKeyHasher;
import com.mfs.tokengateway.db.security.GatewayApiKeyNameRules;

/** 用户 API Key 列表 / 启停 / 强制 rotate（US-G6-05）。 */
@Service
public class AdminUserKeyApplication {

    private static final Logger log = LoggerFactory.getLogger(AdminUserKeyApplication.class);

    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_DISABLED = "disabled";
    static final String ACTION_CREATED = "created";
    static final String ACTION_ROTATED = "rotated";

    private static final int MAX_ROTATE_ATTEMPTS = 3;

    private final AdminUserKeyApplication self;
    private final TokenUserDbService tokenUserDbService;
    private final TokenApiKeyDbService tokenApiKeyDbService;
    private final GatewayApiKeyGenerator apiKeyGenerator;
    private final GatewayApiKeyHasher apiKeyHasher;
    private final GatewayKeyProperties keyProperties;

    public AdminUserKeyApplication(
            @Lazy AdminUserKeyApplication self,
            TokenUserDbService tokenUserDbService,
            TokenApiKeyDbService tokenApiKeyDbService,
            GatewayApiKeyGenerator apiKeyGenerator,
            GatewayApiKeyHasher apiKeyHasher,
            GatewayKeyProperties keyProperties) {
        this.self = self;
        this.tokenUserDbService = tokenUserDbService;
        this.tokenApiKeyDbService = tokenApiKeyDbService;
        this.apiKeyGenerator = apiKeyGenerator;
        this.apiKeyHasher = apiKeyHasher;
        this.keyProperties = keyProperties;
    }

    public AdminUserKeyListResponse list(long userId) {
        requireUser(userId);
        AdminUserKeyListResponse resp = new AdminUserKeyListResponse();
        resp.setUserId(userId);
        List<AdminUserKeyItem> items = new ArrayList<>();
        for (TokenApiKey row : tokenApiKeyDbService.listByUserId(userId)) {
            items.add(toItem(row));
        }
        resp.setItems(items);
        return resp;
    }

    public AdminUserKeyItem updateStatus(
            long userId, String rawName, AdminUserKeyStatusUpdateRequest req, String clientInfo) {
        requireOperatorNote(req.getOperator(), req.getNote());
        String toStatus = requireStatus(req.getStatus());
        String name = normalizeName(rawName);

        TokenUser user = requireUser(userId);
        TokenApiKey key = requireKey(userId, name);
        String fromStatus = key.getStatus();
        boolean noop = toStatus.equalsIgnoreCase(fromStatus != null ? fromStatus : "");

        if (!noop) {
            boolean ok = tokenApiKeyDbService.updateStatus(userId, name, toStatus);
            if (!ok) {
                throw AdminApiException.notFound("key_not_found", "key not found: " + name);
            }
            key = requireKey(userId, name);
        }

        log.info(
                "AUDIT key_status operator={} note={} user_id={} name={} from={} to={} noop={} client={}",
                req.getOperator().trim(),
                req.getNote().trim(),
                user.getId(),
                name,
                fromStatus,
                toStatus,
                noop,
                clientInfo != null ? clientInfo : "-");

        return toItem(key);
    }

    public AdminUserKeyRotateResponse rotate(
            long userId, String rawName, AdminUserKeyRotateRequest req, String clientInfo) {
        requireOperatorNote(req.getOperator(), req.getNote());
        String name = normalizeName(rawName);
        TokenUser user = requireUser(userId);
        String pepper = requirePepper();

        DataIntegrityViolationException lastConflict = null;
        for (int attempt = 1; attempt <= MAX_ROTATE_ATTEMPTS; attempt++) {
            try {
                return self.rotateInTransaction(
                        user, name, pepper, req.getOperator().trim(), req.getNote().trim(), clientInfo);
            } catch (DataIntegrityViolationException e) {
                lastConflict = e;
                log.warn(
                        "admin key rotate unique conflict attempt={}/{} userId={} name={}",
                        attempt,
                        MAX_ROTATE_ATTEMPTS,
                        userId,
                        name);
            }
        }
        throw AdminApiException.conflict(
                "key_hash_conflict",
                "key hash conflict retry exhausted"
                        + (lastConflict != null ? ": " + lastConflict.getMessage() : ""));
    }

    @Transactional
    public AdminUserKeyRotateResponse rotateInTransaction(
            TokenUser user,
            String name,
            String pepper,
            String operator,
            String note,
            String clientInfo) {
        String raw = apiKeyGenerator.generate();
        String hash = apiKeyHasher.hash(pepper, raw);
        String prefix = apiKeyGenerator.prefixOf(raw);

        TokenApiKey existing = tokenApiKeyDbService.findByUserIdAndName(user.getId(), name);
        String action;
        if (existing == null) {
            TokenApiKey row = new TokenApiKey();
            row.setUserId(user.getId());
            row.setName(name);
            row.setKeyHash(hash);
            row.setKeyPrefix(prefix);
            row.setStatus(STATUS_ACTIVE);
            tokenApiKeyDbService.save(row);
            action = ACTION_CREATED;
        } else {
            existing.setKeyHash(hash);
            existing.setKeyPrefix(prefix);
            existing.setStatus(STATUS_ACTIVE);
            tokenApiKeyDbService.updateById(existing);
            action = ACTION_ROTATED;
        }

        // 审计不含明文 api_key
        log.info(
                "AUDIT key_rotate operator={} note={} user_id={} name={} action={} prefix={} "
                        + "account_status={} client={}",
                operator,
                note,
                user.getId(),
                name,
                action,
                prefix,
                user.getStatus(),
                clientInfo != null ? clientInfo : "-");

        AdminUserKeyRotateResponse resp = new AdminUserKeyRotateResponse();
        resp.setAction(action);
        resp.setUserId(user.getId());
        resp.setName(name);
        resp.setPrefix(prefix);
        resp.setStatus(STATUS_ACTIVE);
        resp.setApiKey(raw);
        return resp;
    }

    private TokenUser requireUser(long userId) {
        TokenUser user = tokenUserDbService.getById(userId);
        if (user == null) {
            throw AdminApiException.notFound("user_not_found", "user not found: " + userId);
        }
        return user;
    }

    private TokenApiKey requireKey(long userId, String name) {
        TokenApiKey key = tokenApiKeyDbService.findByUserIdAndName(userId, name);
        if (key == null) {
            throw AdminApiException.notFound("key_not_found", "key not found: " + name);
        }
        return key;
    }

    private String requirePepper() {
        String pepper = keyProperties.getPepper();
        if (pepper == null || pepper.isBlank()) {
            throw AdminApiException.internalError(
                    "pepper_not_configured", "GATEWAY_KEY_PEPPER / token-gateway.key.pepper is required");
        }
        return pepper;
    }

    static void requireOperatorNote(String operator, String note) {
        if (operator == null || operator.isBlank()) {
            throw AdminApiException.badRequest("validation_error", "operator is required");
        }
        if (note == null || note.isBlank()) {
            throw AdminApiException.badRequest("validation_error", "note is required");
        }
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

    static String normalizeName(String rawName) {
        try {
            return GatewayApiKeyNameRules.normalizeAndValidate(rawName);
        } catch (IllegalArgumentException e) {
            throw AdminApiException.badRequest(
                    GatewayApiKeyNameRules.INVALID_NAME, "invalid key name");
        }
    }

    static AdminUserKeyItem toItem(TokenApiKey row) {
        AdminUserKeyItem item = new AdminUserKeyItem();
        item.setId(row.getId());
        item.setName(row.getName());
        item.setPrefix(row.getKeyPrefix());
        item.setStatus(row.getStatus());
        item.setCreatedAt(toInstant(row.getCreatedAt()));
        item.setUpdatedAt(toInstant(row.getUpdatedAt()));
        item.setLastUsedAt(toInstant(row.getLastUsedAt()));
        return item;
    }

    private static java.time.Instant toInstant(LocalDateTime utc) {
        return PriceEncoding.toInstant(utc);
    }
}
