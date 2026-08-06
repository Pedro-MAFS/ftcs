package com.mfs.tokengateway.server.application;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.wechat.WechatCreditResult;
import com.mfs.tokengateway.server.wechat.WechatPaidInfo;
import com.mfs.tokengateway.server.wechat.WechatPayClient;
import com.mfs.tokengateway.server.wechat.WechatQueryException;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.Transaction.TradeStateEnum;
import com.wechat.pay.java.service.payments.model.TransactionAmount;

/**
 * 定时查单补单批处理（US-G3-03）：扫开放单 → 微信查单 → {@code applyTradeState(source=scheduler)}；
 * 码过期仍未付可本地关单。
 */
@Service
public class WechatPaySyncJobApplication {

    private static final Logger log = LoggerFactory.getLogger(WechatPaySyncJobApplication.class);

    static final String FAIL_EXPIRED_UNPAID = "expired_unpaid";

    private final TokenWechatPayOrderDbService orderDbService;
    private final WechatPayClient wechatPayClient;
    private final WechatCreditApplication creditApplication;
    private final TokenGatewayProperties properties;

    public WechatPaySyncJobApplication(
            TokenWechatPayOrderDbService orderDbService,
            WechatPayClient wechatPayClient,
            WechatCreditApplication creditApplication,
            TokenGatewayProperties properties) {
        this.orderDbService = orderDbService;
        this.wechatPayClient = wechatPayClient;
        this.creditApplication = creditApplication;
        this.properties = properties;
    }

    /**
     * @return 本批尝试处理的订单数（含查单失败跳过）
     */
    public int syncBatch() {
        TokenGatewayProperties.WechatPay pay = properties.getWechatPay();
        TokenGatewayProperties.WechatPay.SyncJob job = pay.getSyncJob();
        if (!pay.isEnabled() || !job.isEnabled()) {
            return 0;
        }
        if (!wechatPayClient.isAvailable()) {
            log.warn("wechat sync job skipped: pay client unavailable");
            return 0;
        }

        Instant now = Instant.now();
        Duration minAge = job.getMinAge() == null ? Duration.ofMinutes(2) : job.getMinAge();
        Duration maxAge = job.getMaxAge() == null ? Duration.ofHours(48) : job.getMaxAge();
        int batchSize = job.getBatchSize() <= 0 ? 20 : job.getBatchSize();

        LocalDateTime createdBefore = LocalDateTime.ofInstant(now.minus(minAge), ZoneOffset.UTC);
        LocalDateTime createdAfter = LocalDateTime.ofInstant(now.minus(maxAge), ZoneOffset.UTC);
        List<TokenWechatPayOrder> candidates =
                orderDbService.listOpenForSync(createdBefore, createdAfter, batchSize);
        if (candidates.isEmpty()) {
            log.debug("wechat sync job empty batch");
            return 0;
        }

        log.info("wechat sync job batch size={}", candidates.size());
        int handled = 0;
        for (TokenWechatPayOrder order : candidates) {
            try {
                syncOne(order, now, pay, job);
                handled++;
            } catch (RuntimeException e) {
                log.warn(
                        "wechat sync job skip outTradeNo={} err={}",
                        order.getOutTradeNo(),
                        e.toString());
            }
        }
        return handled;
    }

    void syncOne(
            TokenWechatPayOrder order,
            Instant now,
            TokenGatewayProperties.WechatPay pay,
            TokenGatewayProperties.WechatPay.SyncJob job) {
        String oto = order.getOutTradeNo();
        if (oto == null || oto.isBlank()) {
            return;
        }

        final Transaction tx;
        try {
            tx = wechatPayClient.queryByOutTradeNo(oto);
        } catch (WechatQueryException e) {
            log.warn("wechat sync job query failed outTradeNo={} reason={}", oto, e.getShortCode());
            return;
        }

        TradeStateEnum tradeState = tx.getTradeState();
        WechatPaidInfo paidInfo = null;
        if (tradeState == TradeStateEnum.SUCCESS) {
            Integer total = amountTotal(tx);
            if (isBlank(tx.getTransactionId()) || total == null || total <= 0) {
                log.warn("wechat sync job SUCCESS missing fields outTradeNo={}", oto);
                return;
            }
            paidInfo =
                    new WechatPaidInfo(
                            oto.trim(),
                            tx.getTransactionId().trim(),
                            total,
                            tx.getMchid(),
                            tx.getAppid(),
                            WechatPaidInfo.parsePaidAt(tx.getSuccessTime()),
                            WechatCreditApplication.SOURCE_SCHEDULER);
        }

        WechatCreditResult result =
                creditApplication.applyTradeState(
                        oto.trim(),
                        tradeState,
                        paidInfo,
                        WechatCreditApplication.SOURCE_SCHEDULER);

        if (tradeState == TradeStateEnum.NOTPAY
                || tradeState == TradeStateEnum.USERPAYING
                || tradeState == TradeStateEnum.ACCEPT) {
            maybeExpireUnpaid(order, now, pay, job, tradeState, result);
        } else {
            log.info(
                    "wechat sync job handled outTradeNo={} tradeState={} result={}",
                    oto,
                    tradeState,
                    result);
        }
    }

    private void maybeExpireUnpaid(
            TokenWechatPayOrder order,
            Instant now,
            TokenGatewayProperties.WechatPay pay,
            TokenGatewayProperties.WechatPay.SyncJob job,
            TradeStateEnum tradeState,
            WechatCreditResult result) {
        if (!job.isExpireUnpaid() || tradeState != TradeStateEnum.NOTPAY) {
            log.info(
                    "wechat sync job non-terminal outTradeNo={} tradeState={} result={}",
                    order.getOutTradeNo(),
                    tradeState,
                    result);
            return;
        }
        Duration codeTtl =
                pay.getCodeUrlExpiresIn() == null
                        ? Duration.ofSeconds(7200)
                        : pay.getCodeUrlExpiresIn();
        if (order.getCreatedAt() == null) {
            return;
        }
        Instant created = order.getCreatedAt().toInstant(ZoneOffset.UTC);
        if (created.plus(codeTtl).isAfter(now)) {
            log.info(
                    "wechat sync job unpaid open outTradeNo={} tradeState={} result={}",
                    order.getOutTradeNo(),
                    tradeState,
                    result);
            return;
        }
        WechatCreditResult closed =
                creditApplication.closeIfOpen(order.getOutTradeNo().trim(), FAIL_EXPIRED_UNPAID);
        log.info(
                "wechat sync job expire unpaid outTradeNo={} closeResult={} priorResult={}",
                order.getOutTradeNo(),
                closed,
                result);
    }

    private static Integer amountTotal(Transaction tx) {
        TransactionAmount amount = tx.getAmount();
        return amount == null ? null : amount.getTotal();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
