package com.mfs.tokengateway.server.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.api.dto.WechatOrderResponse;
import com.mfs.tokengateway.server.security.RechargeCaller;
import com.mfs.tokengateway.server.wechat.WechatPaidInfo;
import com.mfs.tokengateway.server.wechat.WechatPayClient;
import com.mfs.tokengateway.server.wechat.WechatQueryException;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.Transaction.TradeStateEnum;
import com.wechat.pay.java.service.payments.model.TransactionAmount;

/**
 * 用户「我已支付」主动查单补账（US-G3-03 用户侧）；复用 {@link WechatCreditApplication#applyTradeState}。
 */
@Service
public class WechatSyncApplication {

    private static final Logger log = LoggerFactory.getLogger(WechatSyncApplication.class);

    private final TokenWechatPayOrderDbService orderDbService;
    private final TokenUserDbService tokenUserDbService;
    private final WechatPayClient wechatPayClient;
    private final WechatCreditApplication creditApplication;
    private final WechatSyncRateLimiter rateLimiter;

    public WechatSyncApplication(
            TokenWechatPayOrderDbService orderDbService,
            TokenUserDbService tokenUserDbService,
            WechatPayClient wechatPayClient,
            WechatCreditApplication creditApplication,
            WechatSyncRateLimiter rateLimiter) {
        this.orderDbService = orderDbService;
        this.tokenUserDbService = tokenUserDbService;
        this.wechatPayClient = wechatPayClient;
        this.creditApplication = creditApplication;
        this.rateLimiter = rateLimiter;
    }

    public WechatOrderResponse sync(RechargeCaller caller, String outTradeNo) {
        if (outTradeNo == null || outTradeNo.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "order_not_found");
        }
        String oto = outTradeNo.trim();
        TokenWechatPayOrder order = requireOwnedOrder(caller, oto);

        Instant now = Instant.now();
        if (!rateLimiter.tryAcquire(caller.getTenantId(), caller.getUserCode(), oto, now)) {
            log.warn(
                    "wechat sync rate limited tenantId={} userCode={} outTradeNo={}",
                    caller.getTenantId(),
                    caller.getUserCode(),
                    oto);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "sync_rate_limited");
        }

        String status = order.getStatus() == null ? "" : order.getStatus();
        if (WechatCreditApplication.STATUS_CREDITED.equalsIgnoreCase(status)
                || WechatCreditApplication.STATUS_CLOSED.equalsIgnoreCase(status)) {
            return toResponse(order, null, loadBalanceLi(order));
        }

        if (!wechatPayClient.isAvailable()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "wechat_pay_unavailable");
        }

        final Transaction tx;
        try {
            tx = wechatPayClient.queryByOutTradeNo(oto);
        } catch (WechatQueryException e) {
            log.warn("wechat sync query failed outTradeNo={} reason={}", oto, e.getShortCode());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat_query_failed", e);
        } catch (RuntimeException e) {
            log.warn("wechat sync query unexpected outTradeNo={}", oto, e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat_query_failed", e);
        }

        TradeStateEnum tradeState = tx.getTradeState();
        WechatPaidInfo paidInfo = null;
        if (tradeState == TradeStateEnum.SUCCESS) {
            Integer total = amountTotal(tx);
            if (isBlank(tx.getTransactionId()) || total == null || total <= 0) {
                log.warn("wechat sync SUCCESS missing fields outTradeNo={}", oto);
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat_query_failed");
            }
            paidInfo =
                    new WechatPaidInfo(
                            oto,
                            tx.getTransactionId().trim(),
                            total,
                            tx.getMchid(),
                            tx.getAppid(),
                            WechatPaidInfo.parsePaidAt(tx.getSuccessTime()),
                            WechatCreditApplication.SOURCE_SYNC);
        }

        try {
            creditApplication.applyTradeState(
                    oto, tradeState, paidInfo, WechatCreditApplication.SOURCE_SYNC);
        } catch (RuntimeException e) {
            log.error("wechat sync apply error outTradeNo={}", oto, e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat_query_failed", e);
        }

        TokenWechatPayOrder refreshed = orderDbService.findByOutTradeNo(oto);
        if (refreshed == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "order_not_found");
        }
        return toResponse(refreshed, tradeState.name(), loadBalanceLi(refreshed));
    }

    private TokenWechatPayOrder requireOwnedOrder(RechargeCaller caller, String outTradeNo) {
        TokenWechatPayOrder order = orderDbService.findByOutTradeNo(outTradeNo);
        if (order == null
                || !caller.getTenantId().equals(order.getTenantId())
                || !caller.getUserCode().equals(order.getUserCode())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "order_not_found");
        }
        return order;
    }

    private Long loadBalanceLi(TokenWechatPayOrder order) {
        if (order.getUserId() != null) {
            TokenUser byId = tokenUserDbService.getById(order.getUserId());
            if (byId != null) {
                return byId.getBalanceLi() == null ? 0L : byId.getBalanceLi();
            }
        }
        TokenUser user =
                tokenUserDbService.findByTenantIdAndUserCode(order.getTenantId(), order.getUserCode());
        if (user == null) {
            return null;
        }
        return user.getBalanceLi() == null ? 0L : user.getBalanceLi();
    }

    static WechatOrderResponse toResponse(
            TokenWechatPayOrder order, String tradeStateOrNull, Long balanceLi) {
        WechatOrderResponse body = new WechatOrderResponse();
        body.setOutTradeNo(order.getOutTradeNo());
        body.setStatus(order.getStatus());
        body.setTradeState(tradeStateOrNull);
        body.setAmountYuan(fromFen(order.getAmountFen()));
        body.setAmountLi(order.getAmountLi());
        body.setCodeUrl(order.getCodeUrl());
        boolean credited =
                WechatCreditApplication.STATUS_CREDITED.equalsIgnoreCase(order.getStatus());
        body.setCreditedLi(credited ? order.getAmountLi() : null);
        body.setBalanceLi(balanceLi);
        if (order.getLastNotifyAt() != null) {
            body.setLastNotifyAt(order.getLastNotifyAt().toInstant(ZoneOffset.UTC));
        }
        body.setLastNotifyTradeState(order.getLastNotifyTradeState());
        body.setLastNotifyResult(order.getLastNotifyResult());
        body.setNotifyCount(order.getNotifyCount() == null ? 0 : order.getNotifyCount());
        if (order.getLastSyncAt() != null) {
            body.setLastSyncAt(order.getLastSyncAt().toInstant(ZoneOffset.UTC));
        }
        body.setLastSyncTradeState(order.getLastSyncTradeState());
        body.setLastSyncResult(order.getLastSyncResult());
        body.setSyncCount(order.getSyncCount() == null ? 0 : order.getSyncCount());
        return body;
    }

    private static String fromFen(Integer fen) {
        if (fen == null) {
            return null;
        }
        return BigDecimal.valueOf(fen)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.UNNECESSARY)
                .toPlainString();
    }

    private static Integer amountTotal(Transaction tx) {
        TransactionAmount amount = tx.getAmount();
        return amount == null ? null : amount.getTotal();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
