package com.mfs.tokengateway.server.application;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenRechargeTicketDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenRechargeTicket;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.api.dto.RechargeTicketResponse;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.security.GatewayApiKeyHasher;
import com.mfs.tokengateway.server.security.RechargeTicketGenerator;
import com.mfs.tokengateway.server.security.UcIdentity;

import jakarta.annotation.PostConstruct;

/**
 * 签发充值短时 ticket（US-G3-06 §4.4）。
 * <p>
 * 外层重试唯一冲突；每次尝试经 Spring 代理进入 {@link #issueInTransaction}，保证独立事务。
 */
@Service
public class RechargeTicketApplication {

    private static final Logger log = LoggerFactory.getLogger(RechargeTicketApplication.class);

    static final int MAX_TICKETS_PER_HOUR = 20;
    private static final int MAX_UNIQUE_ATTEMPTS = 3;
    private static final Duration MIN_TTL = Duration.ofSeconds(60);
    private static final Duration MAX_TTL = Duration.ofHours(24);

    private final RechargeTicketApplication self;
    private final TokenRechargeTicketDbService ticketDbService;
    private final TokenUserDbService tokenUserDbService;
    private final RechargeTicketGenerator ticketGenerator;
    private final GatewayApiKeyHasher hasher;
    private final TokenGatewayProperties properties;

    public RechargeTicketApplication(
            @Lazy RechargeTicketApplication self,
            TokenRechargeTicketDbService ticketDbService,
            TokenUserDbService tokenUserDbService,
            RechargeTicketGenerator ticketGenerator,
            GatewayApiKeyHasher hasher,
            TokenGatewayProperties properties) {
        this.self = self;
        this.ticketDbService = ticketDbService;
        this.tokenUserDbService = tokenUserDbService;
        this.ticketGenerator = ticketGenerator;
        this.hasher = hasher;
        this.properties = properties;
    }

    @PostConstruct
    void validateConfig() {
        Duration ttl = properties.getBilling().getRechargeTicketTtl();
        if (ttl == null || ttl.compareTo(MIN_TTL) < 0 || ttl.compareTo(MAX_TTL) > 0) {
            throw new IllegalStateException(
                    "token-gateway.billing.recharge-ticket-ttl must be in [60s, 24h], got " + ttl);
        }
    }

    public RechargeTicketResponse issue(UcIdentity identity) {
        String pepper = requirePepper();
        Duration ttl = properties.getBilling().getRechargeTicketTtl();

        Instant nowInstant = Instant.now();
        LocalDateTime now = LocalDateTime.ofInstant(nowInstant, ZoneOffset.UTC);
        LocalDateTime hourAgo = now.minusHours(1);
        long issuedLastHour =
                ticketDbService.countCreatedSince(identity.getTenantId(), identity.getUserCode(), hourAgo);
        if (issuedLastHour >= MAX_TICKETS_PER_HOUR) {
            log.warn(
                    "recharge ticket rate limited tenantId={} userCode={} count={}",
                    identity.getTenantId(),
                    identity.getUserCode(),
                    issuedLastHour);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "recharge_ticket_rate_limited");
        }

        TokenUser user =
                tokenUserDbService.findByTenantIdAndUserCode(identity.getTenantId(), identity.getUserCode());
        Long userId = user == null ? null : user.getId();
        Instant expiresAtInstant = nowInstant.plus(ttl);
        LocalDateTime expiresAt = LocalDateTime.ofInstant(expiresAtInstant, ZoneOffset.UTC);

        DataIntegrityViolationException lastConflict = null;
        for (int attempt = 1; attempt <= MAX_UNIQUE_ATTEMPTS; attempt++) {
            try {
                return self.issueInTransaction(identity, pepper, ttl, userId, now, expiresAt, expiresAtInstant);
            } catch (DataIntegrityViolationException e) {
                lastConflict = e;
                log.warn(
                        "recharge ticket hash conflict attempt={}/{} tenantId={} userCode={}",
                        attempt,
                        MAX_UNIQUE_ATTEMPTS,
                        identity.getTenantId(),
                        identity.getUserCode());
            }
        }
        throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR, "recharge_ticket_issue_failed", lastConflict);
    }

    @Transactional
    public RechargeTicketResponse issueInTransaction(
            UcIdentity identity,
            String pepper,
            Duration ttl,
            Long userId,
            LocalDateTime now,
            LocalDateTime expiresAt,
            Instant expiresAtInstant) {
        String raw = ticketGenerator.generate();
        String hash = hasher.hash(pepper, raw);
        TokenRechargeTicket row = new TokenRechargeTicket();
        row.setTicketHash(hash);
        row.setTenantId(identity.getTenantId());
        row.setUserCode(identity.getUserCode());
        row.setUserId(userId);
        row.setExpiresAt(expiresAt);
        row.setCreatedAt(now);
        ticketDbService.save(row);
        log.info(
                "recharge ticket issued id={} tenantId={} userCode={} ticketPrefix={} hashPrefix={} expiresAt={}",
                row.getId(),
                identity.getTenantId(),
                identity.getUserCode(),
                raw.length() >= 8 ? raw.substring(0, 8) : raw,
                hash.substring(0, 8),
                expiresAtInstant);
        return toResponse(raw, ttl, expiresAtInstant);
    }

    private String requirePepper() {
        String pepper = properties.getKey().getPepper();
        if (pepper == null || pepper.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "missing_gateway_key_pepper");
        }
        return pepper;
    }

    private static RechargeTicketResponse toResponse(String raw, Duration ttl, Instant expiresAt) {
        RechargeTicketResponse body = new RechargeTicketResponse();
        body.setTicket(raw);
        body.setExpiresIn(ttl.toSeconds());
        body.setExpiresAt(expiresAt);
        return body;
    }
}
