package com.mfs.tokengateway.admin.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mfs.tokengateway.admin.api.dto.AdminWechatOrderListResponse;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;

@ExtendWith(MockitoExtension.class)
class AdminWechatOrderApplicationTest {

    @Mock
    TokenWechatPayOrderDbService orderDbService;

    @Mock
    TokenUserDbService tokenUserDbService;

    AdminWechatOrderApplication app;

    @BeforeEach
    void setUp() {
        app = new AdminWechatOrderApplication(orderDbService, tokenUserDbService);
    }

    @Test
    void listOrdersDefaultWindowAndLedgerRequestId() {
        Page<TokenWechatPayOrder> page = new Page<>(1, 20);
        TokenWechatPayOrder row = order(1L, 42L, "credited", "4200123");
        page.setRecords(List.of(row));
        page.setTotal(1);
        org.mockito.Mockito.doReturn(page)
                .when(orderDbService)
                .pageForAdmin(isNull(), isNull(), isNull(), any(), any(), eq(1), eq(20));
        when(tokenUserDbService.listByIds(any())).thenReturn(List.of(user(42L)));

        AdminWechatOrderListResponse resp =
                app.listOrders(null, null, null, null, null, null, null);
        assertEquals(1, resp.getTotal());
        assertEquals("wechat:4200123", resp.getItems().get(0).getLedgerRequestId());
        assertEquals("10.000", resp.getItems().get(0).getAmountYuan().toPlainString());
        assertEquals("u42", resp.getItems().get(0).getUserCode());
        assertNull(resp.getItems().get(0).getFailReason());
        assertTrue(resp.getWindow() != null && resp.getWindow().getFrom() != null);
    }

    @Test
    void listOrdersFiltersUserStatusAndTradeNo() {
        Page<TokenWechatPayOrder> page = new Page<>(1, 20);
        page.setRecords(List.of());
        page.setTotal(0);
        org.mockito.Mockito.doReturn(page)
                .when(orderDbService)
                .pageForAdmin(eq(42L), eq("created"), eq("TG001"), any(), any(), eq(1), eq(20));

        app.listOrders(42L, "created", " TG001 ", null, null, 1, 20);
        verify(orderDbService)
                .pageForAdmin(eq(42L), eq("created"), eq("TG001"), any(), any(), eq(1), eq(20));
    }

    @Test
    void listOrdersInvalidStatus() {
        AdminApiException ex = assertThrows(
                AdminApiException.class,
                () -> app.listOrders(null, "bogus", null, null, null, null, null));
        assertEquals("validation_error", ex.getCode());
    }

    @Test
    void listOrdersTimeRangeTooWide() {
        Instant from = Instant.parse("2026-01-01T00:00:00Z");
        Instant to = Instant.parse("2026-05-01T00:00:00Z");
        AdminApiException ex = assertThrows(
                AdminApiException.class,
                () -> app.listOrders(null, null, null, from.toString(), to.toString(), null, null));
        assertEquals("invalid_time_range", ex.getCode());
    }

    @Test
    void listOrdersWithoutWxTxHasNullLedgerRequestId() {
        Page<TokenWechatPayOrder> page = new Page<>(1, 20);
        TokenWechatPayOrder row = order(2L, 42L, "created", null);
        page.setRecords(List.of(row));
        page.setTotal(1);
        org.mockito.Mockito.doReturn(page)
                .when(orderDbService)
                .pageForAdmin(any(), any(), any(), any(), any(), anyInt(), anyInt());
        when(tokenUserDbService.listByIds(any())).thenReturn(List.of(user(42L)));

        AdminWechatOrderListResponse resp =
                app.listOrders(42L, "created", null, null, null, 1, 20);
        assertNull(resp.getItems().get(0).getLedgerRequestId());
    }

    @Test
    void listOrdersPassesUtcWindowToDb() {
        Page<TokenWechatPayOrder> page = new Page<>(1, 20);
        page.setRecords(List.of());
        page.setTotal(0);
        ArgumentCaptor<LocalDateTime> fromCap = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<LocalDateTime> toCap = ArgumentCaptor.forClass(LocalDateTime.class);
        org.mockito.Mockito.doReturn(page)
                .when(orderDbService)
                .pageForAdmin(
                        isNull(),
                        isNull(),
                        isNull(),
                        fromCap.capture(),
                        toCap.capture(),
                        eq(1),
                        eq(20));

        app.listOrders(
                null,
                null,
                null,
                "2026-08-01T00:00:00Z",
                "2026-08-08T00:00:00Z",
                1,
                20);
        assertEquals(LocalDateTime.parse("2026-08-01T00:00:00"), fromCap.getValue());
        assertEquals(LocalDateTime.parse("2026-08-08T00:00:00"), toCap.getValue());
    }

    private static TokenWechatPayOrder order(
            long id, long userId, String status, String wxTx) {
        TokenWechatPayOrder o = new TokenWechatPayOrder();
        o.setId(id);
        o.setUserId(userId);
        o.setUserCode("legacy");
        o.setTenantId("t1");
        o.setOutTradeNo("TG" + id);
        o.setStatus(status);
        o.setAmountLi(10000L);
        o.setWxTransactionId(wxTx);
        o.setCreatedAt(LocalDateTime.parse("2026-08-09T10:00:00"));
        return o;
    }

    private static TokenUser user(long id) {
        TokenUser u = new TokenUser();
        u.setId(id);
        u.setUserCode("u" + id);
        u.setTenantId("t1");
        return u;
    }
}
