package com.mfs.tokengateway.server.application;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.wechat.WechatCreditResult;
import com.mfs.tokengateway.server.wechat.WechatPaidInfo;
import com.wechat.pay.java.service.payments.model.Transaction.TradeStateEnum;

/**
 * 微信支付结果驱动的订单处理（US-G3-02 / G3-03）：入账与非成功终态落库；供 notify 与 sync 共用。
 */
@Service
public class WechatCreditApplication {

    private static final Logger log = LoggerFactory.getLogger(WechatCreditApplication.class);

    public static final String STATUS_CREDITED = "credited";
    public static final String STATUS_CLOSED = "closed";
    public static final String STATUS_FAILED = "failed";
    public static final String OPERATOR_WECHAT = "wechat_pay";

    public static final String SOURCE_NOTIFY = "notify";
    public static final String SOURCE_SYNC = "sync";
    public static final String SOURCE_SCHEDULER = "scheduler";

    private static final int NOTE_MAX = 512;
    private static final int FAIL_REASON_MAX = 256;

    private final TokenWechatPayOrderDbService orderDbService;
    private final TokenUserDbService tokenUserDbService;
    private final TokenLedgerEntryDbService ledgerEntryDbService;
    private final TokenGatewayProperties properties;

    public WechatCreditApplication(
            TokenWechatPayOrderDbService orderDbService,
            TokenUserDbService tokenUserDbService,
            TokenLedgerEntryDbService ledgerEntryDbService,
            TokenGatewayProperties properties) {
        this.orderDbService = orderDbService;
        this.tokenUserDbService = tokenUserDbService;
        this.ledgerEntryDbService = ledgerEntryDbService;
        this.properties = properties;
    }

    /**
     * 按微信 {@code trade_state} 推进本地订单：SUCCESS 入账；CLOSED/REVOKED/PAYERROR 等到终态；
     * NOTPAY/USERPAYING 等中间态不改库。审计字段按 {@code source} 写 notify 或 sync。
     */
    @Transactional
    public WechatCreditResult applyTradeState(
            String outTradeNo,
            TradeStateEnum tradeState,
            WechatPaidInfo paidInfoOrNull,
            String source) {
        if (outTradeNo == null || outTradeNo.isBlank() || tradeState == null) {
            return WechatCreditResult.INVALID_PAYLOAD;
        }
        String src = normalizeSource(source);
        return switch (tradeState) {
            case SUCCESS -> {
                if (paidInfoOrNull == null) {
                    yield recordAndReturn(
                            outTradeNo.trim(), tradeState, WechatCreditResult.INVALID_PAYLOAD, src);
                }
                yield recordAndReturn(
                        outTradeNo.trim(), tradeState, creditIfPaid(paidInfoOrNull), src);
            }
            case CLOSED, REVOKED -> recordAndReturn(
                    outTradeNo.trim(),
                    tradeState,
                    closeIfOpen(outTradeNo.trim(), tradeState.name()),
                    src);
            case PAYERROR -> recordAndReturn(
                    outTradeNo.trim(),
                    tradeState,
                    failIfOpen(outTradeNo.trim(), tradeState.name()),
                    src);
            case REFUND -> recordAndReturn(
                    outTradeNo.trim(), tradeState, onRefundNotify(outTradeNo.trim()), src);
            case NOTPAY, USERPAYING, ACCEPT -> {
                log.info(
                        "wechat {} non-terminal outTradeNo={} state={}",
                        src,
                        outTradeNo,
                        tradeState);
                yield recordAndReturn(
                        outTradeNo.trim(), tradeState, WechatCreditResult.IGNORED_NON_TERMINAL, src);
            }
        };
    }

    /** 兼容旧调用：默认按 notify 写审计字段。 */
    @Transactional
    public WechatCreditResult applyTradeState(
            String outTradeNo, TradeStateEnum tradeState, WechatPaidInfo paidInfoOrNull) {
        return applyTradeState(outTradeNo, tradeState, paidInfoOrNull, SOURCE_NOTIFY);
    }

    private WechatCreditResult recordAndReturn(
            String outTradeNo, TradeStateEnum tradeState, WechatCreditResult result, String source) {
        LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
        int n;
        if (SOURCE_NOTIFY.equals(source)) {
            n = orderDbService.touchLastNotify(outTradeNo, tradeState.name(), result.name(), now);
        } else {
            n = orderDbService.touchLastSync(outTradeNo, tradeState.name(), result.name(), now);
        }
        if (n == 0) {
            log.warn(
                    "wechat {} audit miss outTradeNo={} tradeState={} result={}",
                    source,
                    outTradeNo,
                    tradeState,
                    result);
        }
        log.info(
                "wechat {} handled outTradeNo={} tradeState={} result={}",
                source,
                outTradeNo,
                tradeState,
                result);
        return result;
    }

    private static String normalizeSource(String source) {
        if (source == null || source.isBlank()) {
            return SOURCE_NOTIFY;
        }
        String s = source.trim();
        if (SOURCE_SYNC.equals(s) || SOURCE_SCHEDULER.equals(s) || SOURCE_NOTIFY.equals(s)) {
            return s;
        }
        return SOURCE_NOTIFY;
    }

    @Transactional
    public WechatCreditResult creditIfPaid(WechatPaidInfo info) {
        if (info == null
                || info.getOutTradeNo() == null
                || info.getOutTradeNo().isBlank()
                || info.getTransactionId() == null
                || info.getTransactionId().isBlank()
                || info.getAmountFen() <= 0) {
            return WechatCreditResult.INVALID_PAYLOAD;
        }

        TokenGatewayProperties.WechatPay cfg = properties.getWechatPay();
        if (notBlank(info.getMchId()) && notBlank(cfg.getMchId())
                && !cfg.getMchId().trim().equals(info.getMchId().trim())) {
            log.error(
                    "wechat credit mch mismatch outTradeNo={} notifyMch={} configMch={}",
                    info.getOutTradeNo(),
                    info.getMchId(),
                    cfg.getMchId());
            return WechatCreditResult.MERCHANT_MISMATCH;
        }
        if (notBlank(info.getAppId()) && notBlank(cfg.getAppId())
                && !cfg.getAppId().trim().equals(info.getAppId().trim())) {
            log.error(
                    "wechat credit appid mismatch outTradeNo={} notifyApp={} configApp={}",
                    info.getOutTradeNo(),
                    info.getAppId(),
                    cfg.getAppId());
            return WechatCreditResult.MERCHANT_MISMATCH;
        }

        TokenWechatPayOrder order = orderDbService.lockByOutTradeNo(info.getOutTradeNo().trim());
        if (order == null) {
            log.error("wechat credit order missing outTradeNo={}", info.getOutTradeNo());
            return WechatCreditResult.ORDER_MISSING;
        }

        if (STATUS_CREDITED.equalsIgnoreCase(order.getStatus())) {
            log.info(
                    "wechat credit idempotent outTradeNo={} transactionId={} source={}",
                    order.getOutTradeNo(),
                    info.getTransactionId(),
                    info.getSource());
            return WechatCreditResult.ALREADY_CREDITED;
        }
        if (STATUS_CLOSED.equalsIgnoreCase(order.getStatus())) {
            log.error(
                    "wechat credit refused: order closed outTradeNo={} transactionId={}",
                    order.getOutTradeNo(),
                    info.getTransactionId());
            return WechatCreditResult.ORDER_CLOSED;
        }

        if (order.getAmountFen() == null || order.getAmountFen() != info.getAmountFen()) {
            log.error(
                    "wechat credit amount mismatch outTradeNo={} localFen={} notifyFen={}",
                    order.getOutTradeNo(),
                    order.getAmountFen(),
                    info.getAmountFen());
            return WechatCreditResult.REJECTED_AMOUNT;
        }

        if (order.getWxTransactionId() != null
                && !order.getWxTransactionId().isBlank()
                && !order.getWxTransactionId().equals(info.getTransactionId())) {
            log.error(
                    "wechat credit transaction id conflict outTradeNo={} existing={} incoming={}",
                    order.getOutTradeNo(),
                    order.getWxTransactionId(),
                    info.getTransactionId());
            return WechatCreditResult.REJECTED_AMOUNT;
        }

        long amountLi = order.getAmountLi() == null ? (long) info.getAmountFen() * 10L : order.getAmountLi();
        TokenUser user = tokenUserDbService.lockById(order.getUserId());
        if (user == null) {
            throw new IllegalStateException("token_user_missing:" + order.getUserId());
        }

        long balance = user.getBalanceLi() == null ? 0L : user.getBalanceLi();
        long after = balance + amountLi;
        if (!tokenUserDbService.updateBalanceLi(user.getId(), after)) {
            throw new IllegalStateException("balance_update_failed:" + user.getId());
        }

        LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
        LocalDateTime paidAt = info.getPaidAt() != null ? info.getPaidAt() : now;

        TokenLedgerEntry ledger = new TokenLedgerEntry();
        ledger.setUserId(user.getId());
        ledger.setAmountLi(amountLi);
        ledger.setBalanceAfterLi(after);
        ledger.setRequestId(ledgerRequestId(info.getTransactionId()));
        ledger.setOperator(OPERATOR_WECHAT);
        ledger.setNote(truncate("wechat recharge " + order.getOutTradeNo(), NOTE_MAX));
        ledger.setCreatedAt(now);
        ledgerEntryDbService.insertTopup(ledger);

        orderDbService.markCredited(order.getId(), info.getTransactionId(), paidAt, now);
        log.info(
                "wechat credited outTradeNo={} transactionId={} userId={} amountLi={} balanceAfterLi={} source={}",
                order.getOutTradeNo(),
                info.getTransactionId(),
                user.getId(),
                amountLi,
                after,
                info.getSource());
        return WechatCreditResult.CREDITED;
    }

    @Transactional
    public WechatCreditResult closeIfOpen(String outTradeNo, String reason) {
        TokenWechatPayOrder order = orderDbService.lockByOutTradeNo(outTradeNo);
        if (order == null) {
            log.error("wechat close order missing outTradeNo={}", outTradeNo);
            return WechatCreditResult.ORDER_MISSING;
        }
        if (STATUS_CREDITED.equalsIgnoreCase(order.getStatus())) {
            log.error(
                    "wechat close ignored: already credited outTradeNo={} reason={}",
                    outTradeNo,
                    reason);
            return WechatCreditResult.ALREADY_CREDITED;
        }
        if (STATUS_CLOSED.equalsIgnoreCase(order.getStatus())) {
            return WechatCreditResult.ALREADY_TERMINAL;
        }
        LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
        int n = orderDbService.markClosedIfOpen(order.getId(), truncate(reason, FAIL_REASON_MAX), now);
        log.info(
                "wechat order closed outTradeNo={} reason={} updated={}",
                outTradeNo,
                reason,
                n);
        return n > 0 ? WechatCreditResult.CLOSED : WechatCreditResult.ALREADY_TERMINAL;
    }

    @Transactional
    public WechatCreditResult failIfOpen(String outTradeNo, String reason) {
        TokenWechatPayOrder order = orderDbService.lockByOutTradeNo(outTradeNo);
        if (order == null) {
            log.error("wechat fail order missing outTradeNo={}", outTradeNo);
            return WechatCreditResult.ORDER_MISSING;
        }
        if (STATUS_CREDITED.equalsIgnoreCase(order.getStatus())) {
            log.error(
                    "wechat fail ignored: already credited outTradeNo={} reason={}",
                    outTradeNo,
                    reason);
            return WechatCreditResult.ALREADY_CREDITED;
        }
        if (STATUS_CLOSED.equalsIgnoreCase(order.getStatus())) {
            return WechatCreditResult.ALREADY_TERMINAL;
        }
        LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
        int n = orderDbService.markFailedIfOpen(order.getId(), truncate(reason, FAIL_REASON_MAX), now);
        log.info(
                "wechat order failed outTradeNo={} reason={} updated={}",
                outTradeNo,
                reason,
                n);
        return n > 0 ? WechatCreditResult.FAILED_MARKED : WechatCreditResult.ALREADY_TERMINAL;
    }

    /**
     * 退款结果通知：已入账不自动扣回（G3-05）；未入账则关单。
     */
    @Transactional
    public WechatCreditResult onRefundNotify(String outTradeNo) {
        TokenWechatPayOrder order = orderDbService.lockByOutTradeNo(outTradeNo);
        if (order == null) {
            log.error("wechat refund notify order missing outTradeNo={}", outTradeNo);
            return WechatCreditResult.ORDER_MISSING;
        }
        if (STATUS_CREDITED.equalsIgnoreCase(order.getStatus())) {
            log.error(
                    "wechat refund notify needs manual handling outTradeNo={} status=credited",
                    outTradeNo);
            return WechatCreditResult.REFUND_NEEDS_MANUAL;
        }
        if (STATUS_CLOSED.equalsIgnoreCase(order.getStatus())) {
            return WechatCreditResult.ALREADY_TERMINAL;
        }
        LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
        orderDbService.markClosedIfOpen(order.getId(), truncate("REFUND", FAIL_REASON_MAX), now);
        log.info("wechat refund notify closed unpaid order outTradeNo={}", outTradeNo);
        return WechatCreditResult.REFUND_NEEDS_MANUAL;
    }

    static String ledgerRequestId(String transactionId) {
        String id = "wechat:" + transactionId.trim();
        return id.length() <= 64 ? id : id.substring(0, 64);
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
