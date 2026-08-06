package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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

@ExtendWith(MockitoExtension.class)
class WechatCreditApplicationTest {

    @Mock
    private TokenWechatPayOrderDbService orderDbService;
    @Mock
    private TokenUserDbService tokenUserDbService;
    @Mock
    private TokenLedgerEntryDbService ledgerEntryDbService;

    private TokenGatewayProperties properties;
    private WechatCreditApplication application;

    @BeforeEach
    void setUp() {
        properties = new TokenGatewayProperties();
        properties.getWechatPay().setMchId("mch-1");
        properties.getWechatPay().setAppId("app-1");
        application =
                new WechatCreditApplication(
                        orderDbService, tokenUserDbService, ledgerEntryDbService, properties);
    }

    @Test
    void creditsCreatedOrder() {
        TokenWechatPayOrder order = baseOrder("created");
        when(orderDbService.lockByOutTradeNo("tg1")).thenReturn(order);
        TokenUser user = new TokenUser();
        user.setId(9L);
        user.setBalanceLi(1000L);
        when(tokenUserDbService.lockById(9L)).thenReturn(user);
        when(tokenUserDbService.updateBalanceLi(9L, 6000L)).thenReturn(true);

        WechatPaidInfo info =
                new WechatPaidInfo("tg1", "wx-tx-1", 500, "mch-1", "app-1", null, "notify");
        assertEquals(WechatCreditResult.CREDITED, application.creditIfPaid(info));

        verify(tokenUserDbService).updateBalanceLi(9L, 6000L);
        ArgumentCaptor<TokenLedgerEntry> ledgerCaptor = ArgumentCaptor.forClass(TokenLedgerEntry.class);
        verify(ledgerEntryDbService).insertTopup(ledgerCaptor.capture());
        TokenLedgerEntry ledger = ledgerCaptor.getValue();
        assertEquals(5000L, ledger.getAmountLi());
        assertEquals(6000L, ledger.getBalanceAfterLi());
        assertEquals("wechat:wx-tx-1", ledger.getRequestId());
        assertEquals(WechatCreditApplication.OPERATOR_WECHAT, ledger.getOperator());
        verify(orderDbService).markCredited(eq(1L), eq("wx-tx-1"), any(), any());
    }

    @Test
    void idempotentWhenAlreadyCredited() {
        TokenWechatPayOrder order = baseOrder("credited");
        when(orderDbService.lockByOutTradeNo("tg1")).thenReturn(order);

        WechatPaidInfo info =
                new WechatPaidInfo("tg1", "wx-tx-1", 500, "mch-1", "app-1", null, "notify");
        assertEquals(WechatCreditResult.ALREADY_CREDITED, application.creditIfPaid(info));
        verify(tokenUserDbService, never()).lockById(anyLong());
        verify(ledgerEntryDbService, never()).insertTopup(any());
    }

    @Test
    void rejectsAmountMismatch() {
        TokenWechatPayOrder order = baseOrder("created");
        when(orderDbService.lockByOutTradeNo("tg1")).thenReturn(order);

        WechatPaidInfo info =
                new WechatPaidInfo("tg1", "wx-tx-1", 501, "mch-1", "app-1", null, "notify");
        assertEquals(WechatCreditResult.REJECTED_AMOUNT, application.creditIfPaid(info));
        verify(ledgerEntryDbService, never()).insertTopup(any());
    }

    @Test
    void orderMissing() {
        when(orderDbService.lockByOutTradeNo("tg-missing")).thenReturn(null);
        WechatPaidInfo info =
                new WechatPaidInfo("tg-missing", "wx-tx-1", 500, "mch-1", "app-1", null, "notify");
        assertEquals(WechatCreditResult.ORDER_MISSING, application.creditIfPaid(info));
    }

    @Test
    void closedOrderAckWithoutCredit() {
        TokenWechatPayOrder order = baseOrder("closed");
        when(orderDbService.lockByOutTradeNo("tg1")).thenReturn(order);
        WechatPaidInfo info =
                new WechatPaidInfo("tg1", "wx-tx-1", 500, "mch-1", "app-1", null, "notify");
        assertEquals(WechatCreditResult.ORDER_CLOSED, application.creditIfPaid(info));
        verify(ledgerEntryDbService, never()).insertTopup(any());
    }

    @Test
    void merchantMismatch() {
        WechatPaidInfo info =
                new WechatPaidInfo("tg1", "wx-tx-1", 500, "mch-other", "app-1", null, "notify");
        assertEquals(WechatCreditResult.MERCHANT_MISMATCH, application.creditIfPaid(info));
        verify(orderDbService, never()).lockByOutTradeNo(any());
    }

    @Test
    void closesOpenOrder() {
        TokenWechatPayOrder order = baseOrder("created");
        when(orderDbService.lockByOutTradeNo("tg1")).thenReturn(order);
        when(orderDbService.markClosedIfOpen(eq(1L), eq("CLOSED"), any())).thenReturn(1);

        assertEquals(WechatCreditResult.CLOSED, application.closeIfOpen("tg1", "CLOSED"));
    }

    @Test
    void applyTradeStatePayErrorMarksFailed() {
        TokenWechatPayOrder order = baseOrder("created");
        when(orderDbService.lockByOutTradeNo("tg1")).thenReturn(order);
        when(orderDbService.markFailedIfOpen(eq(1L), eq("PAYERROR"), any())).thenReturn(1);
        when(orderDbService.touchLastNotify(eq("tg1"), eq("PAYERROR"), eq("FAILED_MARKED"), any()))
                .thenReturn(1);

        assertEquals(
                WechatCreditResult.FAILED_MARKED,
                application.applyTradeState("tg1", TradeStateEnum.PAYERROR, null));
        verify(orderDbService).touchLastNotify(eq("tg1"), eq("PAYERROR"), eq("FAILED_MARKED"), any());
    }

    @Test
    void applyTradeStateSyncWritesSyncAudit() {
        when(orderDbService.touchLastSync(eq("tg1"), eq("NOTPAY"), eq("IGNORED_NON_TERMINAL"), any()))
                .thenReturn(1);

        assertEquals(
                WechatCreditResult.IGNORED_NON_TERMINAL,
                application.applyTradeState(
                        "tg1",
                        TradeStateEnum.NOTPAY,
                        null,
                        WechatCreditApplication.SOURCE_SYNC));
        verify(orderDbService)
                .touchLastSync(eq("tg1"), eq("NOTPAY"), eq("IGNORED_NON_TERMINAL"), any());
        verify(orderDbService, never()).touchLastNotify(any(), any(), any(), any());
    }

    private static TokenWechatPayOrder baseOrder(String status) {
        TokenWechatPayOrder order = new TokenWechatPayOrder();
        order.setId(1L);
        order.setOutTradeNo("tg1");
        order.setUserId(9L);
        order.setAmountFen(500);
        order.setAmountLi(5000L);
        order.setStatus(status);
        order.setCreatedAt(LocalDateTime.now());
        return order;
    }
}
