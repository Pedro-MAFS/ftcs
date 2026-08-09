package com.mfs.tokengateway.server.security;

import java.time.LocalDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.security.GatewayApiKeyHasher;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 网关 sk- Chat 鉴权（US-G0-08）。
 */
@Component
public class GatewaySkAuthFacade implements ChatAuthFacade {

    private static final Logger log = LoggerFactory.getLogger(GatewaySkAuthFacade.class);

    static final String STATUS_DISABLED = "disabled";

    private final TokenGatewayProperties properties;
    private final GatewayApiKeyHasher apiKeyHasher;
    private final TokenApiKeyDbService tokenApiKeyDbService;
    private final TokenUserDbService tokenUserDbService;

    public GatewaySkAuthFacade(
            TokenGatewayProperties properties,
            GatewayApiKeyHasher apiKeyHasher,
            TokenApiKeyDbService tokenApiKeyDbService,
            TokenUserDbService tokenUserDbService) {
        this.properties = properties;
        this.apiKeyHasher = apiKeyHasher;
        this.tokenApiKeyDbService = tokenApiKeyDbService;
        this.tokenUserDbService = tokenUserDbService;
    }

    @Override
    public ChatCaller requireAuthenticated() {
        String authorization = currentAuthorizationHeader();
        if (authorization == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "missing_authorization");
        }
        String raw = AuthorizationBearers.extractBearerToken(authorization);
        if (raw == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "missing_authorization");
        }
        if (raw.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_authorization");
        }
        if (!raw.startsWith("sk-")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_api_key");
        }

        String pepper = properties.getKey().getPepper();
        if (pepper == null || pepper.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "missing_gateway_key_pepper");
        }

        String hash = apiKeyHasher.hash(pepper, raw);
        TokenApiKey key = tokenApiKeyDbService.findByKeyHash(hash);
        if (key == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_api_key");
        }
        if (STATUS_DISABLED.equalsIgnoreCase(key.getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "key_disabled");
        }

        TokenUser user = tokenUserDbService.getById(key.getUserId());
        if (user == null) {
            log.warn("orphan api key keyId={} userId={}", key.getId(), key.getUserId());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_api_key");
        }
        if (STATUS_DISABLED.equalsIgnoreCase(user.getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "account_disabled");
        }

        touchLastUsed(key.getId());

        ChatCaller caller = new ChatCaller(
                user.getId(),
                key.getId(),
                key.getName(),
                user.getTenantId(),
                user.getUserCode());
        log.info(
                "chat sk auth ok userId={} keyId={} keyName={}",
                caller.getUserId(),
                caller.getKeyId(),
                caller.getKeyName());
        return caller;
    }

    private void touchLastUsed(Long keyId) {
        try {
            TokenApiKey patch = new TokenApiKey();
            patch.setId(keyId);
            patch.setLastUsedAt(LocalDateTime.now());
            tokenApiKeyDbService.updateById(patch);
        } catch (Exception e) {
            log.warn("update last_used_at failed keyId={}: {}", keyId, e.toString());
        }
    }

    private static String currentAuthorizationHeader() {
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return null;
        }
        HttpServletRequest request = attrs.getRequest();
        return request.getHeader("Authorization");
    }
}
