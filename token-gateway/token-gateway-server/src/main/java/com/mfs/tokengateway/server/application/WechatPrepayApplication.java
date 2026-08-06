package com.mfs.tokengateway.server.application;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.api.dto.WechatOrderResponse;
import com.mfs.tokengateway.server.api.dto.WechatPrepayResponse;
import com.mfs.tokengateway.server.billing.RechargeAmount;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.security.RechargeCaller;
import com.mfs.tokengateway.server.wechat.WechatPayClient;
import com.mfs.tokengateway.server.wechat.WechatPrepayException;

/**
 * 微信 Native 预下单（US-G3-01）：验金额 → 建户 → 落单 → 调微信 → 回写 code_url。
 */
@Service
public class WechatPrepayApplication {

    private static final Logger log = LoggerFactory.getLogger(WechatPrepayApplication.class);

    static final String STATUS_CREATED = "created";
    static final String STATUS_FAILED = "failed";
    static final String STATUS_ACTIVE = "active";

    private static final int MAX_USER_CREATE_ATTEMPTS = 3;
    private static final int MAX_OUT_TRADE_NO_ATTEMPTS = 5;
    private static final int FAIL_REASON_MAX = 256;
    private static final DateTimeFormatter OUT_TRADE_TS =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final WechatPrepayApplication self;
    private final TokenUserDbService tokenUserDbService;
    private final TokenWechatPayOrderDbService orderDbService;
    private final WechatPayClient wechatPayClient;
    private final TokenGatewayProperties properties;
    private final SecureRandom random = new SecureRandom();

    public WechatPrepayApplication(
            @Lazy WechatPrepayApplication self,
            TokenUserDbService tokenUserDbService,
            TokenWechatPayOrderDbService orderDbService,
            WechatPayClient wechatPayClient,
            TokenGatewayProperties properties) {
        this.self = self;
        this.tokenUserDbService = tokenUserDbService;
        this.orderDbService = orderDbService;
        this.wechatPayClient = wechatPayClient;
        this.properties = properties;
    }

    public WechatPrepayResponse prepay(RechargeCaller caller, Object amountYuanRaw) {
        if (!wechatPayClient.isAvailable()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "wechat_pay_unavailable");
        }
        RechargeAmount amount = RechargeAmount.parse(amountYuanRaw);
        TokenGatewayProperties.WechatPay cfg = properties.getWechatPay();
        String description =
                cfg.getDescription() == null || cfg.getDescription().isBlank()
                        ? "官方通道预付费充值"
                        : cfg.getDescription().trim();
        String notifyUrl = cfg.getNotifyUrl().trim();

        TokenUser user = ensureUser(caller);
        TokenWechatPayOrder order = self.insertCreatedOrder(caller, user, amount, description, notifyUrl);

        try {
            String codeUrl =
                    wechatPayClient.createNativeCodeUrl(
                            order.getOutTradeNo(), amount.getFen(), description, notifyUrl);
            LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
            orderDbService.markCreatedWithCodeUrl(order.getId(), codeUrl, now);
            order.setCodeUrl(codeUrl);
            order.setStatus(STATUS_CREATED);
            order.setUpdatedAt(now);
            return toPrepayResponse(order, amount);
        } catch (WechatPrepayException e) {
            LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
            orderDbService.markFailed(order.getId(), truncate(e.getShortCode()), now);
            log.warn(
                    "wechat prepay failed outTradeNo={} userId={} reason={}",
                    order.getOutTradeNo(),
                    user.getId(),
                    e.getShortCode());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat_prepay_failed", e);
        } catch (RuntimeException e) {
            LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
            orderDbService.markFailed(order.getId(), truncate(e.getClass().getSimpleName()), now);
            log.error("wechat prepay unexpected outTradeNo={}", order.getOutTradeNo(), e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat_prepay_failed", e);
        }
    }

    public WechatOrderResponse getOrder(RechargeCaller caller, String outTradeNo) {
        if (outTradeNo == null || outTradeNo.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "order_not_found");
        }
        TokenWechatPayOrder order = orderDbService.findByOutTradeNo(outTradeNo.trim());
        if (order == null
                || !caller.getTenantId().equals(order.getTenantId())
                || !caller.getUserCode().equals(order.getUserCode())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "order_not_found");
        }
        return toOrderResponse(order);
    }

    @Transactional
    public TokenWechatPayOrder insertCreatedOrder(
            RechargeCaller caller,
            TokenUser user,
            RechargeAmount amount,
            String description,
            String notifyUrl) {
        LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
        DataIntegrityViolationException last = null;
        for (int attempt = 1; attempt <= MAX_OUT_TRADE_NO_ATTEMPTS; attempt++) {
            String outTradeNo = newOutTradeNo(now);
            TokenWechatPayOrder row = new TokenWechatPayOrder();
            row.setOutTradeNo(outTradeNo);
            row.setTenantId(caller.getTenantId());
            row.setUserCode(caller.getUserCode());
            row.setUserId(user.getId());
            row.setAmountFen(amount.getFen());
            row.setAmountLi(amount.getLi());
            row.setStatus(STATUS_CREATED);
            row.setDescription(description);
            row.setNotifyUrl(notifyUrl);
            row.setCreatedAt(now);
            row.setUpdatedAt(now);
            try {
                orderDbService.save(row);
                return row;
            } catch (DataIntegrityViolationException e) {
                last = e;
                log.warn(
                        "wechat order out_trade_no conflict attempt={}/{} outTradeNo={}",
                        attempt,
                        MAX_OUT_TRADE_NO_ATTEMPTS,
                        outTradeNo);
            }
        }
        throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR, "account_provision_failed", last);
    }

    private TokenUser ensureUser(RechargeCaller caller) {
        TokenUser existing =
                tokenUserDbService.findByTenantIdAndUserCode(caller.getTenantId(), caller.getUserCode());
        if (existing != null) {
            return existing;
        }
        DataIntegrityViolationException last = null;
        for (int attempt = 1; attempt <= MAX_USER_CREATE_ATTEMPTS; attempt++) {
            try {
                return self.createUserInTransaction(caller);
            } catch (DataIntegrityViolationException e) {
                last = e;
                TokenUser raced =
                        tokenUserDbService.findByTenantIdAndUserCode(
                                caller.getTenantId(), caller.getUserCode());
                if (raced != null) {
                    return raced;
                }
                log.warn(
                        "token user create conflict attempt={}/{} tenantId={} userCode={}",
                        attempt,
                        MAX_USER_CREATE_ATTEMPTS,
                        caller.getTenantId(),
                        caller.getUserCode());
            }
        }
        throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR, "account_provision_failed", last);
    }

    @Transactional
    public TokenUser createUserInTransaction(RechargeCaller caller) {
        TokenUser row = new TokenUser();
        row.setTenantId(caller.getTenantId());
        row.setUserCode(caller.getUserCode());
        row.setBalanceLi(0L);
        row.setStatus(STATUS_ACTIVE);
        tokenUserDbService.save(row);
        log.info(
                "token user created id={} tenantId={} userCode={} via=wechat_prepay",
                row.getId(),
                row.getTenantId(),
                row.getUserCode());
        return row;
    }

    private String newOutTradeNo(LocalDateTime now) {
        byte[] rnd = new byte[6];
        random.nextBytes(rnd);
        return "tg" + OUT_TRADE_TS.format(now) + HexFormat.of().formatHex(rnd);
    }

    private WechatPrepayResponse toPrepayResponse(TokenWechatPayOrder order, RechargeAmount amount) {
        WechatPrepayResponse body = new WechatPrepayResponse();
        body.setOutTradeNo(order.getOutTradeNo());
        body.setCodeUrl(order.getCodeUrl());
        body.setAmountYuan(amount.yuanPlain());
        body.setAmountFen(amount.getFen());
        body.setAmountLi(amount.getLi());
        long expires =
                properties.getWechatPay().getCodeUrlExpiresIn() == null
                        ? 7200L
                        : properties.getWechatPay().getCodeUrlExpiresIn().toSeconds();
        body.setExpiresIn(Math.max(1L, expires));
        body.setStatus(STATUS_CREATED);
        return body;
    }

    private static WechatOrderResponse toOrderResponse(TokenWechatPayOrder order) {
        WechatOrderResponse body = new WechatOrderResponse();
        body.setOutTradeNo(order.getOutTradeNo());
        body.setStatus(order.getStatus());
        body.setAmountYuan(BigDecimalYuan.fromFen(order.getAmountFen()));
        body.setAmountLi(order.getAmountLi());
        body.setCodeUrl(order.getCodeUrl());
        body.setCreditedLi(null);
        body.setBalanceLi(null);
        return body;
    }

    private static String truncate(String s) {
        if (s == null) {
            return null;
        }
        return s.length() <= FAIL_REASON_MAX ? s : s.substring(0, FAIL_REASON_MAX);
    }

    /** 分 → 元两位字符串。 */
    static final class BigDecimalYuan {
        private BigDecimalYuan() {}

        static String fromFen(Integer fen) {
            if (fen == null) {
                return null;
            }
            return java.math.BigDecimal.valueOf(fen, 2).toPlainString();
        }
    }
}
