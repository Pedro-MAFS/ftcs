package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.api.dto.WechatOrderResponse;
import com.mfs.tokengateway.server.security.RechargeCaller;
import com.mfs.tokengateway.server.wechat.WechatCreditResult;
import com.mfs.tokengateway.server.wechat.WechatPayClient;
import com.mfs.tokengateway.server.wechat.WechatQueryException;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.Transaction.TradeStateEnum;
import com.wechat.pay.java.service.payments.model.TransactionAmount;

@ExtendWith(MockitoExtension.class)
class WechatSyncApplicationTest {

    @Mock
    private TokenWechatPayOrderDbService orderDbService;
    @Mock
    private TokenUserDbService tokenUserDbService;
    @Mock
    private WechatPayClient wechatPayClient;
    @Mock
    private WechatCreditApplication creditApplication;

    private WechatSyncRateLimiter rateLimiter;
    private WechatSyncApplication application;
    private RechargeCaller caller;

    @BeforeEach
    void setUp() {
        rateLimiter = new WechatSyncRateLimiter();
        application =
                new WechatSyncApplication(
                        orderDbService,
                        tokenUserDbService,
                        wechatPayClient,
                        creditApplication,
                        rateLimiter);
        caller = new RechargeCaller(1L, "t1", "u1", 9L, Instant.now().plusSeconds(300));
    }

    @Test
    void syncSuccessCreditsViaApplyTradeState() {
        TokenWechatPayOrder order = baseOrder("created");
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(order);
        when(wechatPayClient.isAvailable()).thenReturn(true);

        Transaction tx = new Transaction();
        tx.setOutTradeNo("tg1");
        tx.setTransactionId("wx-tx-1");
        tx.setTradeState(TradeStateEnum.SUCCESS);
        tx.setMchid("mch-1");
        tx.setAppid("app-1");
        TransactionAmount amount = new TransactionAmount();
        amount.setTotal(500);
        tx.setAmount(amount);
        when(wechatPayClient.queryByOutTradeNo("tg1")).thenReturn(tx);
        when(creditApplication.applyTradeState(
                        eq("tg1"),
                        eq(TradeStateEnum.SUCCESS),
                        any(),
                        eq(WechatCreditApplication.SOURCE_SYNC)))
                .thenReturn(WechatCreditResult.CREDITED);

        TokenWechatPayOrder credited = baseOrder("credited");
        credited.setLastSyncTradeState("SUCCESS");
        credited.setLastSyncResult("CREDITED");
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(order, credited);

        TokenUser user = new TokenUser();
        user.setId(9L);
        user.setBalanceLi(6000L);
        when(tokenUserDbService.getById(9L)).thenReturn(user);

        WechatOrderResponse body = application.sync(caller, "tg1");
        assertEquals("credited", body.getStatus());
        assertEquals("SUCCESS", body.getTradeState());
        assertEquals(5000L, body.getCreditedLi());
        assertEquals(6000L, body.getBalanceLi());
    }

    @Test
    void syncNotPayKeepsCreated() {
        TokenWechatPayOrder order = baseOrder("created");
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(order);
        when(wechatPayClient.isAvailable()).thenReturn(true);

        Transaction tx = new Transaction();
        tx.setOutTradeNo("tg1");
        tx.setTradeState(TradeStateEnum.NOTPAY);
        when(wechatPayClient.queryByOutTradeNo("tg1")).thenReturn(tx);
        when(creditApplication.applyTradeState(
                        eq("tg1"),
                        eq(TradeStateEnum.NOTPAY),
                        isNull(),
                        eq(WechatCreditApplication.SOURCE_SYNC)))
                .thenReturn(WechatCreditResult.IGNORED_NON_TERMINAL);

        TokenWechatPayOrder after = baseOrder("created");
        after.setLastSyncTradeState("NOTPAY");
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(order, after);
        when(tokenUserDbService.getById(9L)).thenReturn(userWithBalance(1000L));

        WechatOrderResponse body = application.sync(caller, "tg1");
        assertEquals("created", body.getStatus());
        assertEquals("NOTPAY", body.getTradeState());
        assertNull(body.getCreditedLi());
    }

    @Test
    void shortCircuitsCreditedWithoutWechatQuery() {
        TokenWechatPayOrder order = baseOrder("credited");
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(order);
        when(tokenUserDbService.getById(9L)).thenReturn(userWithBalance(6000L));

        WechatOrderResponse body = application.sync(caller, "tg1");
        assertEquals("credited", body.getStatus());
        assertNull(body.getTradeState());
        assertEquals(6000L, body.getBalanceLi());
        verify(wechatPayClient, never()).queryByOutTradeNo(any());
        verify(creditApplication, never()).applyTradeState(any(), any(), any(), any());
    }

    @Test
    void wrongOwnerReturns404() {
        TokenWechatPayOrder order = baseOrder("created");
        order.setUserCode("other");
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(order);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.sync(caller, "tg1"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        assertEquals("order_not_found", ex.getReason());
    }

    @Test
    void queryFailureMapsTo502() {
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(baseOrder("created"));
        when(wechatPayClient.isAvailable()).thenReturn(true);
        when(wechatPayClient.queryByOutTradeNo("tg1"))
                .thenThrow(new WechatQueryException("SYSTEM_ERROR"));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.sync(caller, "tg1"));
        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertEquals("wechat_query_failed", ex.getReason());
    }

    @Test
    void rateLimitedReturns429() {
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(baseOrder("credited"));
        when(tokenUserDbService.getById(9L)).thenReturn(userWithBalance(1L));

        application.sync(caller, "tg1");
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.sync(caller, "tg1"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatusCode());
        assertEquals("sync_rate_limited", ex.getReason());
    }

    private static TokenWechatPayOrder baseOrder(String status) {
        TokenWechatPayOrder order = new TokenWechatPayOrder();
        order.setId(1L);
        order.setOutTradeNo("tg1");
        order.setTenantId("t1");
        order.setUserCode("u1");
        order.setUserId(9L);
        order.setAmountFen(500);
        order.setAmountLi(5000L);
        order.setStatus(status);
        return order;
    }

    private static TokenUser userWithBalance(long li) {
        TokenUser user = new TokenUser();
        user.setId(9L);
        user.setBalanceLi(li);
        return user;
    }
}
