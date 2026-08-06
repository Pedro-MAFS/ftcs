package com.mfs.tokengateway.server.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import com.mfs.tokengateway.server.application.WechatCreditApplication;
import com.mfs.tokengateway.server.wechat.WechatCreditResult;
import com.mfs.tokengateway.server.wechat.WechatNotifyException;
import com.mfs.tokengateway.server.wechat.WechatPayClient;
import com.wechat.pay.java.core.notification.RequestParam;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.Transaction.TradeStateEnum;
import com.wechat.pay.java.service.payments.model.TransactionAmount;

@ExtendWith(MockitoExtension.class)
class WechatNotifyControllerTest {

    @Mock
    private WechatPayClient wechatPayClient;
    @Mock
    private WechatCreditApplication creditApplication;

    private WechatNotifyController controller;

    @BeforeEach
    void setUp() {
        controller = new WechatNotifyController(wechatPayClient, creditApplication);
    }

    @Test
    void successCredits() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        Transaction tx = tx("tg1", "wx1", 500, TradeStateEnum.SUCCESS);
        when(wechatPayClient.parsePaymentNotification(any(RequestParam.class))).thenReturn(tx);
        when(creditApplication.applyTradeState(eq("tg1"), eq(TradeStateEnum.SUCCESS), any(), eq("notify")))
                .thenReturn(WechatCreditResult.CREDITED);

        ResponseEntity<Map<String, String>> res = notifyOk("{}");
        assertEquals(200, res.getStatusCode().value());
        assertEquals("SUCCESS", res.getBody().get("code"));
    }

    @Test
    void closedMovesToTerminal() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        Transaction tx = tx("tg1", null, null, TradeStateEnum.CLOSED);
        when(wechatPayClient.parsePaymentNotification(any(RequestParam.class))).thenReturn(tx);
        when(creditApplication.applyTradeState(eq("tg1"), eq(TradeStateEnum.CLOSED), isNull(), eq("notify")))
                .thenReturn(WechatCreditResult.CLOSED);

        ResponseEntity<Map<String, String>> res = notifyOk("{}");
        assertEquals(200, res.getStatusCode().value());
        verify(creditApplication).applyTradeState(eq("tg1"), eq(TradeStateEnum.CLOSED), isNull(), eq("notify"));
    }

    @Test
    void nonTerminalAcks() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        Transaction tx = tx("tg1", null, null, TradeStateEnum.NOTPAY);
        when(wechatPayClient.parsePaymentNotification(any(RequestParam.class))).thenReturn(tx);
        when(creditApplication.applyTradeState(eq("tg1"), eq(TradeStateEnum.NOTPAY), isNull(), eq("notify")))
                .thenReturn(WechatCreditResult.IGNORED_NON_TERMINAL);

        ResponseEntity<Map<String, String>> res = notifyOk("{}");
        assertEquals(200, res.getStatusCode().value());
        assertEquals("SUCCESS", res.getBody().get("code"));
    }

    @Test
    void signatureInvalid() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        when(wechatPayClient.parsePaymentNotification(any(RequestParam.class)))
                .thenThrow(new WechatNotifyException("signature_invalid"));

        ResponseEntity<Map<String, String>> res = notifyOk("{}");
        assertEquals(401, res.getStatusCode().value());
        assertEquals("FAIL", res.getBody().get("code"));
        assertEquals("signature_invalid", res.getBody().get("message"));
    }

    @Test
    void amountMismatchFails() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        when(wechatPayClient.parsePaymentNotification(any(RequestParam.class)))
                .thenReturn(tx("tg1", "wx1", 500, TradeStateEnum.SUCCESS));
        when(creditApplication.applyTradeState(eq("tg1"), eq(TradeStateEnum.SUCCESS), any(), eq("notify")))
                .thenReturn(WechatCreditResult.REJECTED_AMOUNT);

        ResponseEntity<Map<String, String>> res = notifyOk("{}");
        assertEquals(500, res.getStatusCode().value());
        assertEquals("amount_mismatch", res.getBody().get("message"));
    }

    private ResponseEntity<Map<String, String>> notifyOk(String body) {
        return controller.notify(
                body, "serial", "nonce", "1234567890", "signature", "WECHATPAY2-SHA256-RSA2048");
    }

    private static Transaction tx(String outTradeNo, String txId, Integer fen, TradeStateEnum state) {
        Transaction tx = new Transaction();
        tx.setOutTradeNo(outTradeNo);
        tx.setTransactionId(txId);
        tx.setTradeState(state);
        tx.setMchid("mch-1");
        tx.setAppid("app-1");
        if (fen != null) {
            TransactionAmount amount = new TransactionAmount();
            amount.setTotal(fen);
            tx.setAmount(amount);
        }
        return tx;
    }
}
