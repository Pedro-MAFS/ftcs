package com.mfs.tokengateway.admin.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mfs.tokengateway.admin.api.dto.AdminLedgerListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminRequestDetailResponse;
import com.mfs.tokengateway.admin.api.dto.AdminRequestListResponse;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.db.po.TokenUser;

@ExtendWith(MockitoExtension.class)
class AdminUsageApplicationTest {

    @Mock
    private TokenRequestLogDbService requestLogDbService;

    @Mock
    private TokenLedgerEntryDbService ledgerEntryDbService;

    @Mock
    private TokenUserDbService tokenUserDbService;

    private AdminUsageApplication app;

    @BeforeEach
    void setUp() {
        app = new AdminUsageApplication(requestLogDbService, ledgerEntryDbService, tokenUserDbService);
    }

    @Test
    void listRequestsMapsYuanAndUser() {
        TokenRequestLog row = request("01JABC", 42L, "charged", 5L);
        row.setCogsLi(2L);
        row.setMarginLi(3L);
        Page<TokenRequestLog> page = new Page<>(1, 20);
        page.setRecords(List.of(row));
        page.setTotal(1);
        stubRequestPage(page);
        when(tokenUserDbService.listByIds(any())).thenReturn(List.of(user(42L)));

        AdminRequestListResponse resp =
                app.listRequests(null, null, null, null, null, null, null, null, null, null);
        assertEquals(1, resp.getTotal());
        assertEquals("u_91bb04", resp.getItems().get(0).getUserCode());
        assertEquals("0.005", resp.getItems().get(0).getRevenueYuan().toPlainString());
        assertEquals("0.002", resp.getItems().get(0).getCogsYuan().toPlainString());
        assertEquals("0.003", resp.getItems().get(0).getMarginYuan().toPlainString());
        assertEquals("charged", resp.getItems().get(0).getBillingStatus());
        assertTrue(resp.getWindow() != null);
    }

    @Test
    void listRequestsExactRequestIdIgnoresWindowFlag() {
        Page<TokenRequestLog> page = new Page<>(1, 20);
        page.setRecords(List.of());
        page.setTotal(0);
        stubRequestPage(page);

        app.listRequests(null, "01JXYZ123", null, null, null, null, null, null, null, null);

        ArgumentCaptor<Boolean> ignore = ArgumentCaptor.forClass(Boolean.class);
        ArgumentCaptor<String> rid = ArgumentCaptor.forClass(String.class);
        verify(requestLogDbService)
                .pageForAdmin(
                        any(),
                        any(),
                        rid.capture(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        ignore.capture(),
                        anyInt(),
                        anyInt());
        assertEquals("01JXYZ123", rid.getValue());
        assertTrue(ignore.getValue());
    }

    @Test
    void invalidTimeRange() {
        AdminApiException ex = assertThrows(
                AdminApiException.class,
                () -> app.listRequests(
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        "2026-01-01T00:00:00Z",
                        "2026-05-01T00:00:00Z",
                        1,
                        20));
        assertEquals("invalid_time_range", ex.getCode());
    }

    @Test
    void invalidBillingStatus() {
        AdminApiException ex = assertThrows(
                AdminApiException.class,
                () -> app.listRequests(null, null, null, "weird", null, null, null, null, 1, 20));
        assertEquals("validation_error", ex.getCode());
    }

    @Test
    void getRequestWithLedger() {
        TokenRequestLog row = request("01JABC", 42L, "charged", 5L);
        when(requestLogDbService.findByRequestId("01JABC")).thenReturn(row);
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L));
        TokenLedgerEntry charge = new TokenLedgerEntry();
        charge.setId(9L);
        charge.setAmountLi(-5L);
        charge.setBalanceAfterLi(1000L);
        charge.setCreatedAt(LocalDateTime.parse("2026-08-09T10:12:02"));
        when(ledgerEntryDbService.findByRequestId("01JABC")).thenReturn(charge);

        AdminRequestDetailResponse d = app.getRequest("01JABC");
        assertEquals("charged", d.getBillingStatus());
        assertEquals(-5L, d.getLedgerCharge().getAmountLi());
        assertEquals("0.005", d.getRevenueYuan().toPlainString());
    }

    @Test
    void getRequestNotFound() {
        when(requestLogDbService.findByRequestId("missing")).thenReturn(null);
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.getRequest("missing"));
        assertEquals("request_not_found", ex.getCode());
    }

    @Test
    void listLedgerDefaultsCharge() {
        Page<TokenLedgerEntry> page = new Page<>(1, 20);
        TokenLedgerEntry e = new TokenLedgerEntry();
        e.setId(1L);
        e.setUserId(42L);
        e.setType("charge");
        e.setAmountLi(-10L);
        e.setBalanceAfterLi(990L);
        e.setCreatedAt(LocalDateTime.parse("2026-08-09T10:00:00"));
        page.setRecords(List.of(e));
        page.setTotal(1);
        org.mockito.Mockito.doReturn(page)
                .when(ledgerEntryDbService)
                .pageForAdmin(any(), any(), eq("charge"), any(), any(), any(), any(), eq(1), eq(20));
        when(tokenUserDbService.listByIds(any())).thenReturn(List.of(user(42L)));

        AdminLedgerListResponse resp =
                app.listLedger(null, null, null, null, null, null, null, null);
        assertEquals(1, resp.getTotal());
        assertEquals("charge", resp.getItems().get(0).getType());
        assertEquals("-0.010", resp.getItems().get(0).getAmountYuan().toPlainString());
        assertNull(resp.getItems().get(0).getSource());
    }

    @Test
    void listLedgerCreditsFilterAndSource() {
        Page<TokenLedgerEntry> page = new Page<>(1, 20);
        TokenLedgerEntry wx = new TokenLedgerEntry();
        wx.setId(1L);
        wx.setUserId(42L);
        wx.setType("topup");
        wx.setAmountLi(10000L);
        wx.setBalanceAfterLi(10000L);
        wx.setOperator("wechat_pay");
        wx.setCreatedAt(LocalDateTime.parse("2026-08-09T10:00:00"));
        TokenLedgerEntry manual = new TokenLedgerEntry();
        manual.setId(2L);
        manual.setUserId(42L);
        manual.setType("adjust");
        manual.setAmountLi(-1000L);
        manual.setBalanceAfterLi(9000L);
        manual.setOperator("ops:alice");
        manual.setCreatedAt(LocalDateTime.parse("2026-08-09T11:00:00"));
        page.setRecords(List.of(wx, manual));
        page.setTotal(2);
        org.mockito.Mockito.doReturn(page)
                .when(ledgerEntryDbService)
                .pageForAdmin(any(), any(), eq("credits"), any(), any(), any(), any(), eq(1), eq(20));
        when(tokenUserDbService.listByIds(any())).thenReturn(List.of(user(42L)));

        AdminLedgerListResponse resp =
                app.listLedger(null, "credits", null, null, null, null, 1, 20);
        assertEquals(2, resp.getTotal());
        assertEquals("wechat", resp.getItems().get(0).getSource());
        assertEquals("manual", resp.getItems().get(1).getSource());
    }

    @Test
    void listLedgerAllTypes() {
        Page<TokenLedgerEntry> page = new Page<>(1, 20);
        page.setRecords(List.of());
        page.setTotal(0);
        org.mockito.Mockito.doReturn(page)
                .when(ledgerEntryDbService)
                .pageForAdmin(any(), any(), isNull(), any(), any(), any(), any(), eq(1), eq(20));

        app.listLedger(null, "all", null, null, null, null, 1, 20);
        verify(ledgerEntryDbService)
                .pageForAdmin(any(), any(), isNull(), any(), any(), any(), any(), eq(1), eq(20));
    }

    @Test
    void listRequestsForUserNotFound() {
        when(tokenUserDbService.getById(9L)).thenReturn(null);
        AdminApiException ex = assertThrows(
                AdminApiException.class,
                () -> app.listRequestsForUser(9L, null, null, null, null, null, null, null, 1, 20));
        assertEquals("user_not_found", ex.getCode());
    }

    @Test
    void looksLikeRequestId() {
        assertTrue(AdminUsageApplication.looksLikeRequestId("01JABCDEFG"));
        assertTrue(!AdminUsageApplication.looksLikeRequestId("bad name"));
        assertTrue(!AdminUsageApplication.looksLikeRequestId("short"));
    }

    private void stubRequestPage(Page<TokenRequestLog> page) {
        org.mockito.Mockito.doReturn(page)
                .when(requestLogDbService)
                .pageForAdmin(
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        anyInt(),
                        anyInt());
    }

    private static TokenRequestLog request(String id, long userId, String billing, Long revenue) {
        TokenRequestLog row = new TokenRequestLog();
        row.setRequestId(id);
        row.setUserId(userId);
        row.setKeyName("ftcs-desktop");
        row.setModel("deepseek-v4-flash");
        row.setStatus("success");
        row.setBillingStatus(billing);
        row.setPromptTokens(10);
        row.setCompletionTokens(2);
        row.setRevenueLi(revenue);
        row.setCreatedAt(LocalDateTime.parse("2026-08-09T10:12:01"));
        return row;
    }

    private static TokenUser user(long id) {
        TokenUser u = new TokenUser();
        u.setId(id);
        u.setUserCode("u_91bb04");
        u.setTenantId("tenant_acme");
        return u;
    }
}
