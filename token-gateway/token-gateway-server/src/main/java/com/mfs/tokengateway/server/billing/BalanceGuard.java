package com.mfs.tokengateway.server.billing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

import jakarta.annotation.PostConstruct;

/**
 * Chat 余额预检（US-G0-11）：不足则 402，不转发上游。
 */
@Component
public class BalanceGuard {

    private static final Logger log = LoggerFactory.getLogger(BalanceGuard.class);

    private final TokenGatewayProperties properties;
    private final TokenUserDbService tokenUserDbService;

    public BalanceGuard(TokenGatewayProperties properties, TokenUserDbService tokenUserDbService) {
        this.properties = properties;
        this.tokenUserDbService = tokenUserDbService;
    }

    @PostConstruct
    void validateConfig() {
        long min = properties.getBilling().getMinBalanceLi();
        if (min < 0) {
            throw new IllegalStateException(
                    "token-gateway.billing.min-balance-li must be >= 0, got " + min);
        }
    }

    /**
     * @throws ResponseStatusException 402 {@code insufficient_balance}；孤儿用户 401
     */
    public void requireSufficientBalance(long userId) {
        TokenUser user = tokenUserDbService.getById(userId);
        if (user == null) {
            log.warn("balance precheck orphan userId={}", userId);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_api_key");
        }
        long min = properties.getBilling().getMinBalanceLi();
        long balance = user.getBalanceLi() == null ? 0L : user.getBalanceLi();
        if (balance < min) {
            log.info(
                    "balance precheck reject userId={} balanceLi={} minBalanceLi={}",
                    userId,
                    balance,
                    min);
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "insufficient_balance");
        }
    }
}
