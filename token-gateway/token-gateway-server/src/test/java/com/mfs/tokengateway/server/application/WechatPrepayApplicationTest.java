package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.api.dto.WechatPrepayResponse;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.security.RechargeCaller;
import com.mfs.tokengateway.server.wechat.WechatPayClient;
import com.mfs.tokengateway.server.wechat.WechatPrepayException;

@ExtendWith(MockitoExtension.class)
class WechatPrepayApplicationTest {

    @Mock
    private TokenUserDbService tokenUserDbService;
    @Mock
    private TokenWechatPayOrderDbService orderDbService;
    @Mock
    private WechatPayClient wechatPayClient;

    private TokenGatewayProperties properties;
    private WechatPrepayApplication application;
    private RechargeCaller caller;

    @BeforeEach
    void setUp() {
        properties = new TokenGatewayProperties();
        properties.getWechatPay().setEnabled(true);
        properties.getWechatPay().setNotifyUrl("https://gw.example/v1/billing/wechat/notify");
        properties.getWechatPay().setDescription("官方通道预付费充值");
        properties.getWechatPay().setCodeUrlExpiresIn(Duration.ofSeconds(7200));

        application =
                new WechatPrepayApplication(
                        null, tokenUserDbService, orderDbService, wechatPayClient, properties);
        // self-invoke: use same instance (unit test; @Transactional not active)
        application =
                new WechatPrepayApplication(
                        application, tokenUserDbService, orderDbService, wechatPayClient, properties);

        caller = new RechargeCaller(1L, "tenant-a", "user-b", null, Instant.now().plusSeconds(120));
    }

    @Test
    void prepaySuccessCreatesOrderAndReturnsCodeUrl() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        TokenUser user = new TokenUser();
        user.setId(42L);
        user.setTenantId("tenant-a");
        user.setUserCode("user-b");
        user.setBalanceLi(0L);
        user.setStatus("active");
        when(tokenUserDbService.findByTenantIdAndUserCode("tenant-a", "user-b")).thenReturn(user);
        when(orderDbService.save(any(TokenWechatPayOrder.class))).thenAnswer(inv -> {
            TokenWechatPayOrder row = inv.getArgument(0);
            row.setId(7L);
            return true;
        });
        when(wechatPayClient.createNativeCodeUrl(anyString(), eq(5000), anyString(), anyString()))
                .thenReturn("weixin://wxpay/bizpayurl?pr=test");

        WechatPrepayResponse body = application.prepay(caller, "50.00");

        assertEquals("weixin://wxpay/bizpayurl?pr=test", body.getCodeUrl());
        assertEquals(5000, body.getAmountFen());
        assertEquals(50_000L, body.getAmountLi());
        assertEquals("50.00", body.getAmountYuan());
        assertEquals("created", body.getStatus());
        assertEquals(7200L, body.getExpiresIn());
        verify(orderDbService).markCreatedWithCodeUrl(eq(7L), eq("weixin://wxpay/bizpayurl?pr=test"), any());
    }

    @Test
    void prepayUnavailable() {
        when(wechatPayClient.isAvailable()).thenReturn(false);
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.prepay(caller, "50"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertEquals("wechat_pay_unavailable", ex.getReason());
        verify(wechatPayClient, never()).createNativeCodeUrl(anyString(), anyInt(), anyString(), anyString());
    }

    @Test
    void prepayWechatFailureMarksFailed() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        TokenUser user = new TokenUser();
        user.setId(42L);
        when(tokenUserDbService.findByTenantIdAndUserCode(anyString(), anyString())).thenReturn(user);
        when(orderDbService.save(any(TokenWechatPayOrder.class))).thenAnswer(inv -> {
            TokenWechatPayOrder row = inv.getArgument(0);
            row.setId(8L);
            return true;
        });
        when(wechatPayClient.createNativeCodeUrl(anyString(), anyInt(), anyString(), anyString()))
                .thenThrow(new WechatPrepayException("PARAM_ERROR"));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.prepay(caller, 10));
        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertEquals("wechat_prepay_failed", ex.getReason());
        verify(orderDbService).markFailed(eq(8L), eq("PARAM_ERROR"), any());
    }

    @Test
    void getOrderHidesOtherUsers() {
        TokenWechatPayOrder order = new TokenWechatPayOrder();
        order.setOutTradeNo("tg1");
        order.setTenantId("other");
        order.setUserCode("u");
        order.setAmountFen(1000);
        order.setAmountLi(10_000L);
        order.setStatus("created");
        when(orderDbService.findByOutTradeNo("tg1")).thenReturn(order);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.getOrder(caller, "tg1"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void ensureUserCreatesWhenMissing() {
        when(wechatPayClient.isAvailable()).thenReturn(true);
        when(tokenUserDbService.findByTenantIdAndUserCode("tenant-a", "user-b"))
                .thenReturn(null)
                .thenReturn(null);
        when(tokenUserDbService.save(any(TokenUser.class))).thenAnswer(inv -> {
            TokenUser u = inv.getArgument(0);
            u.setId(99L);
            return true;
        });
        when(orderDbService.save(any(TokenWechatPayOrder.class))).thenAnswer(inv -> {
            TokenWechatPayOrder row = inv.getArgument(0);
            row.setId(1L);
            return true;
        });
        when(wechatPayClient.createNativeCodeUrl(anyString(), anyInt(), anyString(), anyString()))
                .thenReturn("weixin://ok");

        application.prepay(caller, 1);

        ArgumentCaptor<TokenUser> userCaptor = ArgumentCaptor.forClass(TokenUser.class);
        verify(tokenUserDbService).save(userCaptor.capture());
        assertEquals(0L, userCaptor.getValue().getBalanceLi());
        assertEquals("active", userCaptor.getValue().getStatus());
        verify(orderDbService, never()).markFailed(anyLong(), anyString(), any());
    }
}
