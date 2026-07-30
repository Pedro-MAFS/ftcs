package com.mfs.tokengateway.server.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.api.dto.KeyRotateResponse;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.security.GatewayApiKeyGenerator;
import com.mfs.tokengateway.server.security.GatewayApiKeyHasher;
import com.mfs.tokengateway.server.security.UcIdentity;

/**
 * 按 name 签发 / 重置 Key（US-G0-06）。
 * <p>
 * 外层重试唯一冲突；每次尝试经 Spring 代理进入 {@link #rotateInTransaction}，保证独立事务。
 */
@Service
public class KeyRotateApplication {

    private static final Logger log = LoggerFactory.getLogger(KeyRotateApplication.class);

    static final String STATUS_ACTIVE = "active";
    static final String STATUS_DISABLED = "disabled";
    static final String ACTION_CREATED = "created";
    static final String ACTION_ROTATED = "rotated";

    private static final int MAX_ATTEMPTS = 3;

    private final KeyRotateApplication self;
    private final TokenUserDbService tokenUserDbService;
    private final TokenApiKeyDbService tokenApiKeyDbService;
    private final GatewayApiKeyGenerator apiKeyGenerator;
    private final GatewayApiKeyHasher apiKeyHasher;
    private final TokenGatewayProperties properties;

    public KeyRotateApplication(
            @Lazy KeyRotateApplication self,
            TokenUserDbService tokenUserDbService,
            TokenApiKeyDbService tokenApiKeyDbService,
            GatewayApiKeyGenerator apiKeyGenerator,
            GatewayApiKeyHasher apiKeyHasher,
            TokenGatewayProperties properties) {
        this.self = self;
        this.tokenUserDbService = tokenUserDbService;
        this.tokenApiKeyDbService = tokenApiKeyDbService;
        this.apiKeyGenerator = apiKeyGenerator;
        this.apiKeyHasher = apiKeyHasher;
        this.properties = properties;
    }

    public KeyRotateResponse rotate(UcIdentity identity, String rawName) {
        String name = KeyNameRules.normalizeAndValidate(rawName);
        String pepper = requirePepper();

        DataIntegrityViolationException lastConflict = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return self.rotateInTransaction(identity, name, pepper);
            } catch (DataIntegrityViolationException e) {
                lastConflict = e;
                log.warn(
                        "key rotate unique conflict attempt={}/{} tenantId={} userCode={} name={}",
                        attempt,
                        MAX_ATTEMPTS,
                        identity.getTenantId(),
                        identity.getUserCode(),
                        name);
            }
        }
        throw new ResponseStatusException(
                HttpStatus.CONFLICT, "conflict_retry_exhausted", lastConflict);
    }

    /**
     * 单次签发/重置；须经 Spring 代理调用（勿本类 {@code this.} 直调），以便事务与重试解耦。
     */
    @Transactional
    public KeyRotateResponse rotateInTransaction(UcIdentity identity, String name, String pepper) {
        TokenUser user = findOrCreateUser(identity);
        if (STATUS_DISABLED.equalsIgnoreCase(user.getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "account_disabled");
        }

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
            log.info(
                    "api key created userId={} name={} keyId={}",
                    user.getId(),
                    name,
                    row.getId());
        } else {
            existing.setKeyHash(hash);
            existing.setKeyPrefix(prefix);
            existing.setStatus(STATUS_ACTIVE);
            tokenApiKeyDbService.updateById(existing);
            action = ACTION_ROTATED;
            log.info(
                    "api key rotated userId={} name={} keyId={}",
                    user.getId(),
                    name,
                    existing.getId());
        }

        return toResponse(action, name, raw, prefix, user);
    }

    private TokenUser findOrCreateUser(UcIdentity identity) {
        TokenUser existing = tokenUserDbService.findByTenantIdAndUserCode(
                identity.getTenantId(), identity.getUserCode());
        if (existing != null) {
            return existing;
        }
        TokenUser row = new TokenUser();
        row.setTenantId(identity.getTenantId());
        row.setUserCode(identity.getUserCode());
        row.setBalanceLi(0L);
        row.setStatus(STATUS_ACTIVE);
        tokenUserDbService.save(row);
        log.info(
                "token user created id={} tenantId={} userCode={}",
                row.getId(),
                row.getTenantId(),
                row.getUserCode());
        return row;
    }

    private String requirePepper() {
        String pepper = properties.getKey().getPepper();
        if (pepper == null || pepper.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "missing_gateway_key_pepper");
        }
        return pepper;
    }

    private static KeyRotateResponse toResponse(
            String action, String name, String raw, String prefix, TokenUser user) {
        KeyRotateResponse body = new KeyRotateResponse();
        body.setAction(action);
        body.setName(name);
        body.setApiKey(raw);
        body.setPrefix(prefix);
        body.setStatus(STATUS_ACTIVE);

        KeyRotateResponse.UserView uv = new KeyRotateResponse.UserView();
        uv.setTenantId(user.getTenantId());
        uv.setUserCode(user.getUserCode());
        uv.setBalanceLi(user.getBalanceLi() == null ? 0L : user.getBalanceLi());
        uv.setStatus(user.getStatus());
        body.setUser(uv);
        return body;
    }
}
