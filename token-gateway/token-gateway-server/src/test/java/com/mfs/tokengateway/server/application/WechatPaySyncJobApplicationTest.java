package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.wechat.WechatCreditResult;
import com.mfs.tokengateway.server.wechat.WechatPayClient;
import com.mfs.tokengateway.server.wechat.WechatQueryException;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.Transaction.TradeStateEnum;
import com.wechat.pay.java.service.payments.model.TransactionAmount;

@ExtendWith(MockitoExtension.class)
class WechatPaySyncJobApplicationTest {

    @Mock
    private TokenWechatPayOrderDbService orderDbService;
    @Mock
    private WechatPayClient wechatPayClient;
    @Mock
    private WechatCreditApplication creditApplication;

    private TokenGatewayProperties properties;
    private WechatPaySyncJobApplication application;

    @BeforeEach
    void setUp() {
        properties = new TokenGatewayProperties();
        properties.getWechatPay().setEnabled(true);
        properties.getWechatPay().setCodeUrlExpiresIn(Duration.ofHours(2));
        properties.getWechatPay().getSyncJob().setEnabled(true);
        properties.getWechatPay().getSyncJob().setBatchSize(20);
        properties.getWechatPay().getSyncJob().setMinAge(Duration.ofMinutes(2));
        properties.getWechatPay().getSyncJob().setMaxAge(Duration.ofHours(48));
        properties.getWechatPay().getSyncJob().setExpireUnpaid(true);
        application =
                new WechatPaySyncJobApplication(
                        orderDbService, wechatPayClient, creditApplication, properties);
    }

    @Test
    void syncBatchCreditsSuccess() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        TokenWechatPayOrder order = openOrder(Instant.now().minus(Duration.ofMinutes(5)));
        when(orderDbService.listOpenForSync(any(), any(), eq(20))).thenReturn(List.of(order));

        Transaction tx = successTx("tg1", 500);
        when(wechatPayClient.queryByOutTradeNo("tg1")).thenReturn(tx);
        when(creditApplication.applyTradeState(
                        eq("tg1"),
                        eq(TradeStateEnum.SUCCESS),
                        any(),
                        eq(WechatCreditApplication.SOURCE_SCHEDULER)))
                .thenReturn(WechatCreditResult.CREDITED);

        assertEquals(1, application.syncBatch());
        verify(creditApplication)
                .applyTradeState(
                        eq("tg1"),
                        eq(TradeStateEnum.SUCCESS),
                        any(),
                        eq(WechatCreditApplication.SOURCE_SCHEDULER));
        verify(creditApplication, never()).closeIfOpen(any(), any());
    }

    @Test
    void expiresUnpaidAfterCodeTtl() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        TokenWechatPayOrder order = openOrder(Instant.now().minus(Duration.ofHours(3)));
        when(orderDbService.listOpenForSync(any(), any(), eq(20))).thenReturn(List.of(order));

        Transaction tx = new Transaction();
        tx.setOutTradeNo("tg1");
        tx.setTradeState(TradeStateEnum.NOTPAY);
        when(wechatPayClient.queryByOutTradeNo("tg1")).thenReturn(tx);
        when(creditApplication.applyTradeState(
                        eq("tg1"),
                        eq(TradeStateEnum.NOTPAY),
                        isNull(),
                        eq(WechatCreditApplication.SOURCE_SCHEDULER)))
                .thenReturn(WechatCreditResult.IGNORED_NON_TERMINAL);
        when(creditApplication.closeIfOpen("tg1", WechatPaySyncJobApplication.FAIL_EXPIRED_UNPAID))
                .thenReturn(WechatCreditResult.CLOSED);

        assertEquals(1, application.syncBatch());
        verify(creditApplication)
                .closeIfOpen("tg1", WechatPaySyncJobApplication.FAIL_EXPIRED_UNPAID);
    }

    @Test
    void doesNotExpireUnpaidWithinCodeTtl() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        TokenWechatPayOrder order = openOrder(Instant.now().minus(Duration.ofMinutes(10)));
        when(orderDbService.listOpenForSync(any(), any(), eq(20))).thenReturn(List.of(order));

        Transaction tx = new Transaction();
        tx.setOutTradeNo("tg1");
        tx.setTradeState(TradeStateEnum.NOTPAY);
        when(wechatPayClient.queryByOutTradeNo("tg1")).thenReturn(tx);
        when(creditApplication.applyTradeState(
                        eq("tg1"),
                        eq(TradeStateEnum.NOTPAY),
                        isNull(),
                        eq(WechatCreditApplication.SOURCE_SCHEDULER)))
                .thenReturn(WechatCreditResult.IGNORED_NON_TERMINAL);

        assertEquals(1, application.syncBatch());
        verify(creditApplication, never()).closeIfOpen(any(), any());
    }

    @Test
    void queryFailureSkipsOrder() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        TokenWechatPayOrder order = openOrder(Instant.now().minus(Duration.ofMinutes(5)));
        when(orderDbService.listOpenForSync(any(), any(), eq(20))).thenReturn(List.of(order));
        when(wechatPayClient.queryByOutTradeNo("tg1"))
                .thenThrow(new WechatQueryException("SYSTEM_ERROR"));

        assertEquals(1, application.syncBatch());
        verify(creditApplication, never()).applyTradeState(any(), any(), any(), any());
    }

    @Test
    void disabledPayReturnsZero() {
        properties.getWechatPay().setEnabled(false);
        assertEquals(0, application.syncBatch());
        verify(wechatPayClient, never()).isAvailable();
    }

    private static TokenWechatPayOrder openOrder(Instant created) {
        TokenWechatPayOrder order = new TokenWechatPayOrder();
        order.setId(1L);
        order.setOutTradeNo("tg1");
        order.setStatus("created");
        order.setCreatedAt(LocalDateTime.ofInstant(created, ZoneOffset.UTC));
        return order;
    }

    private static Transaction successTx(String oto, int fen) {
        Transaction tx = new Transaction();
        tx.setOutTradeNo(oto);
        tx.setTransactionId("wx-1");
        tx.setTradeState(TradeStateEnum.SUCCESS);
        tx.setMchid("mch");
        tx.setAppid("app");
        TransactionAmount amount = new TransactionAmount();
        amount.setTotal(fen);
        tx.setAmount(amount);
        return tx;
    }
}
