package com.mfs.tokengateway.server.security;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenRechargeTicketDbService;
import com.mfs.tokengateway.db.po.TokenRechargeTicket;
import com.mfs.tokengateway.db.security.GatewayApiKeyHasher;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

/**
 * 校验充值短时 ticket（US-G3-06 §4.5 / §4.6）。
 */
@Service
public class RechargeTicketAuthService {

    private static final Logger log = LoggerFactory.getLogger(RechargeTicketAuthService.class);

    public static final String PREFIX = "rt_";
    public static final String REASON_INVALID = "invalid_recharge_ticket";

    private final TokenRechargeTicketDbService ticketDbService;
    private final GatewayApiKeyHasher hasher;
    private final TokenGatewayProperties properties;

    public RechargeTicketAuthService(
            TokenRechargeTicketDbService ticketDbService,
            GatewayApiKeyHasher hasher,
            TokenGatewayProperties properties) {
        this.ticketDbService = ticketDbService;
        this.hasher = hasher;
        this.properties = properties;
    }

    /**
     * 解析并校验明文 ticket；无效返回 empty（不抛异常，供页面入口使用）。
     */
    public Optional<RechargeCaller> resolve(String rawTicket) {
        if (rawTicket == null || rawTicket.isBlank()) {
            return Optional.empty();
        }
        String raw = rawTicket.trim();
        if (!raw.startsWith(PREFIX)) {
            return Optional.empty();
        }
        String pepper = properties.getKey().getPepper();
        if (pepper == null || pepper.isBlank()) {
            log.warn("recharge ticket resolve skipped: missing pepper");
            return Optional.empty();
        }

        String hash;
        try {
            hash = hasher.hash(pepper, raw);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }

        TokenRechargeTicket row = ticketDbService.findByTicketHash(hash);
        if (row == null) {
            return Optional.empty();
        }
        if (row.getRevokedAt() != null) {
            return Optional.empty();
        }
        Instant now = Instant.now();
        Instant expiresAt = row.getExpiresAt().toInstant(ZoneOffset.UTC);
        if (!expiresAt.isAfter(now)) {
            return Optional.empty();
        }
        return Optional.of(new RechargeCaller(
                row.getId(), row.getTenantId(), row.getUserCode(), row.getUserId(), expiresAt));
    }

    /** 业务 API 用：无效则 401。 */
    public RechargeCaller requireValid(String rawTicket) {
        return resolve(rawTicket)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, REASON_INVALID));
    }

    public void touchLastUsed(RechargeCaller caller) {
        LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
        ticketDbService.updateLastUsedAt(caller.getTicketId(), now);
    }
}
