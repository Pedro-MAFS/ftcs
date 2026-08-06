package com.mfs.tokengateway.server.api;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.server.application.WechatCreditApplication;
import com.mfs.tokengateway.server.wechat.WechatCreditResult;
import com.mfs.tokengateway.server.wechat.WechatNotifyException;
import com.mfs.tokengateway.server.wechat.WechatPaidInfo;
import com.mfs.tokengateway.server.wechat.WechatPayClient;
import com.wechat.pay.java.core.notification.RequestParam;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.Transaction.TradeStateEnum;
import com.wechat.pay.java.service.payments.model.TransactionAmount;

/**
 * 微信支付结果通知（US-G3-02）。应答体为微信约定格式，非网关 {@code reason} 短码。
 */
@RestController
@RequestMapping("/v1/billing/wechat")
public class WechatNotifyController {

    private static final Logger log = LoggerFactory.getLogger(WechatNotifyController.class);

    private final WechatPayClient wechatPayClient;
    private final WechatCreditApplication creditApplication;

    public WechatNotifyController(
            WechatPayClient wechatPayClient, WechatCreditApplication creditApplication) {
        this.wechatPayClient = wechatPayClient;
        this.creditApplication = creditApplication;
    }

    @PostMapping(value = "/notify", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> notify(
            @RequestBody String body,
            @RequestHeader(value = "Wechatpay-Serial", required = false) String serial,
            @RequestHeader(value = "Wechatpay-Nonce", required = false) String nonce,
            @RequestHeader(value = "Wechatpay-Timestamp", required = false) String timestamp,
            @RequestHeader(value = "Wechatpay-Signature", required = false) String signature,
            @RequestHeader(value = "Wechatpay-Signature-Type", required = false) String signType) {
        if (!wechatPayClient.isAvailable()) {
            log.error("wechat notify while pay unavailable");
            return fail(500, "wechat_pay_unavailable");
        }
        if (body == null
                || body.isBlank()
                || isBlank(serial)
                || isBlank(nonce)
                || isBlank(timestamp)
                || isBlank(signature)) {
            return fail(401, "signature_invalid");
        }

        RequestParam.Builder paramBuilder =
                new RequestParam.Builder()
                        .serialNumber(serial.trim())
                        .nonce(nonce.trim())
                        .timestamp(timestamp.trim())
                        .signature(signature.trim())
                        .body(body);
        if (!isBlank(signType)) {
            paramBuilder.signType(signType.trim());
        }

        final Transaction tx;
        try {
            tx = wechatPayClient.parsePaymentNotification(paramBuilder.build());
        } catch (WechatNotifyException e) {
            log.warn("wechat notify verify failed reason={}", e.getShortCode());
            return fail(401, e.getShortCode());
        }

        if (tx == null || tx.getTradeState() == null) {
            return fail(500, "invalid_payload");
        }
        if (isBlank(tx.getOutTradeNo())) {
            return fail(500, "invalid_payload");
        }

        WechatPaidInfo paidInfo = null;
        if (tx.getTradeState() == TradeStateEnum.SUCCESS) {
            Integer total = amountTotal(tx);
            if (isBlank(tx.getTransactionId()) || total == null || total <= 0) {
                return fail(500, "invalid_payload");
            }
            paidInfo =
                    new WechatPaidInfo(
                            tx.getOutTradeNo().trim(),
                            tx.getTransactionId().trim(),
                            total,
                            tx.getMchid(),
                            tx.getAppid(),
                            WechatPaidInfo.parsePaidAt(tx.getSuccessTime()),
                            "notify");
        }

        WechatCreditResult result;
        try {
            result =
                    creditApplication.applyTradeState(
                            tx.getOutTradeNo().trim(),
                            tx.getTradeState(),
                            paidInfo,
                            WechatCreditApplication.SOURCE_NOTIFY);
        } catch (RuntimeException e) {
            log.error("wechat notify apply error outTradeNo={}", tx.getOutTradeNo(), e);
            return fail(500, "credit_failed");
        }

        return switch (result) {
            case CREDITED,
                    ALREADY_CREDITED,
                    ORDER_CLOSED,
                    CLOSED,
                    FAILED_MARKED,
                    ALREADY_TERMINAL,
                    REFUND_NEEDS_MANUAL,
                    IGNORED_NON_TERMINAL -> ok();
            case ORDER_MISSING -> fail(404, "order_missing");
            case REJECTED_AMOUNT -> fail(500, "amount_mismatch");
            case MERCHANT_MISMATCH -> fail(500, "merchant_mismatch");
            case INVALID_PAYLOAD -> fail(500, "invalid_payload");
        };
    }

    private static Integer amountTotal(Transaction tx) {
        TransactionAmount amount = tx.getAmount();
        return amount == null ? null : amount.getTotal();
    }

    private static ResponseEntity<Map<String, String>> ok() {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("code", "SUCCESS");
        body.put("message", "成功");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private static ResponseEntity<Map<String, String>> fail(int httpStatus, String message) {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("code", "FAIL");
        body.put("message", message);
        return ResponseEntity.status(httpStatus)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
