package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.api.dto.BillingPortalTopupsResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalUsageResponse;
import com.mfs.tokengateway.server.security.RechargeCaller;

@ExtendWith(MockitoExtension.class)
class BillingPortalApplicationTest {

    @Mock
    private TokenUserDbService tokenUserDbService;
    @Mock
    private TokenRequestLogDbService tokenRequestLogDbService;
    @Mock
    private TokenWechatPayOrderDbService tokenWechatPayOrderDbService;

    private BillingPortalApplication app;

    @BeforeEach
    void setUp() {
        app = new BillingPortalApplication(
                tokenUserDbService, tokenRequestLogDbService, tokenWechatPayOrderDbService);
    }

    @Test
    void maskUserCodeKeepsPrefixAndSuffix() {
        assertEquals("u_****8a21", BillingPortalApplication.maskUserCode("u_abxx8a21"));
        assertEquals("ab****yz", BillingPortalApplication.maskUserCode("ab12yz"));
        assertEquals("****", BillingPortalApplication.maskUserCode("ab"));
        assertEquals("—", BillingPortalApplication.maskUserCode(""));
    }

    @Test
    void liToYuanConvertsAndKeepsNull() {
        assertNull(BillingPortalApplication.liToYuan(null));
        assertEquals(0, BillingPortalApplication.liToYuan(0L).compareTo(new BigDecimal("0.000")));
        assertEquals(0, BillingPortalApplication.liToYuan(5L).compareTo(new BigDecimal("0.005")));
        assertEquals(0, BillingPortalApplication.liToYuan(1200L).compareTo(new BigDecimal("1.200")));
    }

    @Test
    void toUsageItemOmitsCogsAndCached() {
        TokenRequestLog row = new TokenRequestLog();
        row.setRequestId("r1");
        row.setCreatedAt(LocalDateTime.ofInstant(Instant.parse("2026-08-06T06:00:00Z"), ZoneOffset.UTC));
        row.setModel("deepseek-chat");
        row.setKeyName("ftcs-desktop");
        row.setStatus("success");
        row.setBillingStatus("charged");
        row.setPromptTokens(10);
        row.setCompletionTokens(20);
        row.setCachedTokens(5);
        row.setRevenueLi(15L);
        row.setCogsLi(3L);
        row.setMarginLi(12L);

        var item = BillingPortalApplication.toUsageItem(row);
        assertEquals("r1", item.getRequestId());
        assertEquals(Integer.valueOf(10), item.getPromptTokens());
        assertEquals(Integer.valueOf(20), item.getCompletionTokens());
        assertEquals(0, item.getChargeYuan().compareTo(new BigDecimal("0.015")));
    }

    @Test
    void normalizeLimitRejectsOutOfRange() {
        assertEquals(20, BillingPortalApplication.normalizeLimit(null));
        assertEquals(5, BillingPortalApplication.normalizeLimit(5));
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> BillingPortalApplication.normalizeLimit(0));
        assertEquals("invalid_limit", ex.getReason());
        assertThrows(ResponseStatusException.class, () -> BillingPortalApplication.normalizeLimit(51));
    }

    @Test
    void decodeCursorRoundTrip() {
        Instant t = Instant.parse("2026-08-06T06:12:01.123Z");
        String encoded = BillingPortalApplication.encodeCursor(t, "req_1");
        var cursor = BillingPortalApplication.decodeCursor(encoded);
        assertEquals(t, cursor.t());
        assertEquals("req_1", cursor.id());
    }

    @Test
    void decodeCursorRejectsGarbage() {
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> BillingPortalApplication.decodeCursor("%%%"));
        assertEquals("invalid_cursor", ex.getReason());
    }

    @Test
    void listUsageRejectsWindowOver90Days() {
        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> app.listUsage(
                        caller,
                        20,
                        "2026-01-01T00:00:00Z",
                        "2026-08-01T00:00:00Z",
                        null));
        assertEquals("invalid_time_range", ex.getReason());
    }

    @Test
    void listUsageReturnsEmptyWhenNoUser() {
        RechargeCaller caller = new RechargeCaller(1L, "t", "u", null, Instant.now().plusSeconds(60));
        when(tokenUserDbService.findByTenantIdAndUserCode("t", "u")).thenReturn(null);

        BillingPortalUsageResponse body = app.listUsage(caller, 20, null, null, null);
        assertTrue(body.getItems().isEmpty());
        assertNull(body.getNextCursor());
        assertTrue(body.getWindow() != null);
    }

    @Test
    void listUsageMapsRowsAndBuildsNextCursor() {
        TokenUser user = new TokenUser();
        user.setId(9L);
        user.setUserCode("u");
        user.setStatus("active");
        user.setBalanceLi(1000L);

        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        when(tokenUserDbService.getById(9L)).thenReturn(user);

        TokenRequestLog a = baseLog("r-b", "2026-08-06T10:00:00Z", 10L);
        TokenRequestLog b = baseLog("r-a", "2026-08-06T09:00:00Z", null);
        when(tokenRequestLogDbService.listForPortal(
                        eq(9L), any(), any(), isNull(), isNull(), eq(2)))
                .thenReturn(List.of(a, b));

        BillingPortalUsageResponse body = app.listUsage(caller, 2, null, null, null);
        assertEquals(2, body.getItems().size());
        assertEquals(0, body.getItems().get(0).getChargeYuan().compareTo(new BigDecimal("0.010")));
        assertNull(body.getItems().get(1).getChargeYuan());
        assertTrue(body.getNextCursor() != null);

        var cursor = BillingPortalApplication.decodeCursor(body.getNextCursor());
        assertEquals("r-a", cursor.id());
    }

    @Test
    void listUsagePassesDecodedCursorToDb() {
        TokenUser user = new TokenUser();
        user.setId(9L);
        when(tokenUserDbService.getById(9L)).thenReturn(user);
        when(tokenRequestLogDbService.listForPortal(
                        anyLong(), any(), any(), any(), any(), anyInt()))
                .thenReturn(List.of());

        Instant t = Instant.parse("2026-08-06T06:00:00Z");
        String cursor = BillingPortalApplication.encodeCursor(t, "r9");
        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        app.listUsage(caller, 20, null, null, cursor);

        ArgumentCaptor<LocalDateTime> cursorT = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<String> cursorId = ArgumentCaptor.forClass(String.class);
        verify(tokenRequestLogDbService)
                .listForPortal(eq(9L), any(), any(), cursorT.capture(), cursorId.capture(), eq(20));
        assertEquals(LocalDateTime.ofInstant(t, ZoneOffset.UTC), cursorT.getValue());
        assertEquals("r9", cursorId.getValue());
    }

    @Test
    void toTopupItemConvertsYuanAndGatesFailReason() {
        TokenWechatPayOrder credited = baseOrder(1L, "o1", "2026-08-06T10:00:00Z", 1200L, "credited");
        credited.setFailReason("should-hide");
        var creditedItem = BillingPortalApplication.toTopupItem(credited);
        assertEquals("o1", creditedItem.getOutTradeNo());
        assertEquals(0, creditedItem.getAmountYuan().compareTo(new BigDecimal("1.200")));
        assertNull(creditedItem.getFailReason());

        TokenWechatPayOrder failed = baseOrder(2L, "o2", "2026-08-06T09:00:00Z", 500L, "failed");
        failed.setFailReason("pay error");
        var failedItem = BillingPortalApplication.toTopupItem(failed);
        assertEquals("pay error", failedItem.getFailReason());
    }

    @Test
    void listTopupsReturnsEmptyWhenNoUser() {
        RechargeCaller caller = new RechargeCaller(1L, "t", "u", null, Instant.now().plusSeconds(60));
        when(tokenUserDbService.findByTenantIdAndUserCode("t", "u")).thenReturn(null);

        BillingPortalTopupsResponse body = app.listTopups(caller, 20, null, null, null);
        assertTrue(body.getItems().isEmpty());
        assertNull(body.getNextCursor());
        assertTrue(body.getWindow() != null);
    }

    @Test
    void listTopupsMapsRowsAndBuildsNextCursor() {
        TokenUser user = new TokenUser();
        user.setId(9L);
        when(tokenUserDbService.getById(9L)).thenReturn(user);

        TokenWechatPayOrder a = baseOrder(11L, "out-b", "2026-08-06T10:00:00Z", 1000L, "credited");
        TokenWechatPayOrder b = baseOrder(10L, "out-a", "2026-08-06T09:00:00Z", 500L, "created");
        when(tokenWechatPayOrderDbService.listForPortal(
                        eq(9L), any(), any(), isNull(), isNull(), eq(2)))
                .thenReturn(List.of(a, b));

        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        BillingPortalTopupsResponse body = app.listTopups(caller, 2, null, null, null);
        assertEquals(2, body.getItems().size());
        assertEquals(0, body.getItems().get(0).getAmountYuan().compareTo(new BigDecimal("1.000")));
        assertTrue(body.getNextCursor() != null);

        var cursor = BillingPortalApplication.decodeCursor(body.getNextCursor());
        assertEquals("10", cursor.id());
    }

    @Test
    void listTopupsPassesDecodedCursorToDb() {
        TokenUser user = new TokenUser();
        user.setId(9L);
        when(tokenUserDbService.getById(9L)).thenReturn(user);
        when(tokenWechatPayOrderDbService.listForPortal(
                        anyLong(), any(), any(), any(), any(), anyInt()))
                .thenReturn(List.of());

        Instant t = Instant.parse("2026-08-06T06:00:00Z");
        String cursor = BillingPortalApplication.encodeCursor(t, "42");
        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        app.listTopups(caller, 20, null, null, cursor);

        ArgumentCaptor<LocalDateTime> cursorT = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<Long> cursorId = ArgumentCaptor.forClass(Long.class);
        verify(tokenWechatPayOrderDbService)
                .listForPortal(eq(9L), any(), any(), cursorT.capture(), cursorId.capture(), eq(20));
        assertEquals(LocalDateTime.ofInstant(t, ZoneOffset.UTC), cursorT.getValue());
        assertEquals(Long.valueOf(42L), cursorId.getValue());
    }

    @Test
    void listTopupsRejectsNonNumericCursorId() {
        TokenUser user = new TokenUser();
        user.setId(9L);
        when(tokenUserDbService.getById(9L)).thenReturn(user);

        Instant t = Instant.parse("2026-08-06T06:00:00Z");
        String cursor = BillingPortalApplication.encodeCursor(t, "not-a-number");
        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> app.listTopups(caller, 20, null, null, cursor));
        assertEquals("invalid_cursor", ex.getReason());
    }

    private static TokenWechatPayOrder baseOrder(
            long id, String outTradeNo, String createdAt, Long amountLi, String status) {
        TokenWechatPayOrder row = new TokenWechatPayOrder();
        row.setId(id);
        row.setOutTradeNo(outTradeNo);
        row.setCreatedAt(LocalDateTime.ofInstant(Instant.parse(createdAt), ZoneOffset.UTC));
        row.setAmountLi(amountLi);
        row.setStatus(status);
        row.setDescription("微信充值");
        return row;
    }

    private static TokenRequestLog baseLog(String id, String createdAt, Long revenueLi) {
        TokenRequestLog row = new TokenRequestLog();
        row.setRequestId(id);
        row.setCreatedAt(LocalDateTime.ofInstant(Instant.parse(createdAt), ZoneOffset.UTC));
        row.setModel("m");
        row.setKeyName("k");
        row.setStatus("success");
        row.setBillingStatus(revenueLi == null ? "pending" : "charged");
        row.setPromptTokens(1);
        row.setCompletionTokens(2);
        row.setRevenueLi(revenueLi);
        return row;
    }
}
