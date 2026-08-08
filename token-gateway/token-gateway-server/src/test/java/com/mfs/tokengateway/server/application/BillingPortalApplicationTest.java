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

import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenPriceRuleDbService;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.dbservice.TokenWechatPayOrderDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenPriceRule;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;
import com.mfs.tokengateway.server.api.dto.BillingPortalKeysResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalPricesResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalTopupsResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalUsageResponse;
import com.mfs.tokengateway.server.api.dto.KeyRotateResponse;
import com.mfs.tokengateway.server.security.RechargeCaller;
import com.mfs.tokengateway.server.security.UcIdentity;
import com.mfs.tokengateway.server.upstream.ModelWhitelist;

@ExtendWith(MockitoExtension.class)
class BillingPortalApplicationTest {

    @Mock
    private TokenUserDbService tokenUserDbService;
    @Mock
    private TokenRequestLogDbService tokenRequestLogDbService;
    @Mock
    private TokenWechatPayOrderDbService tokenWechatPayOrderDbService;
    @Mock
    private TokenPriceRuleDbService tokenPriceRuleDbService;
    @Mock
    private TokenApiKeyDbService tokenApiKeyDbService;
    @Mock
    private KeyRotateApplication keyRotateApplication;

    private ModelWhitelist modelWhitelist;
    private BillingPortalApplication app;

    @BeforeEach
    void setUp() {
        modelWhitelist = new ModelWhitelist(java.util.Set.of(
                "deepseek-v4-pro", "deepseek-v4-flash", "deepseek-unpriced"));
        app = new BillingPortalApplication(
                tokenUserDbService,
                tokenRequestLogDbService,
                tokenWechatPayOrderDbService,
                tokenPriceRuleDbService,
                tokenApiKeyDbService,
                modelWhitelist,
                keyRotateApplication);
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
        Instant t = Instant.parse("2026-08-06T06:00:00Z");
        String cursor = BillingPortalApplication.encodeCursor(t, "not-a-number");
        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> app.listTopups(caller, 20, null, null, cursor));
        assertEquals("invalid_cursor", ex.getReason());
    }

    @Test
    void toPriceItemConvertsYuanAndOmitsUpstream() {
        TokenPriceRule row = new TokenPriceRule();
        row.setModel("deepseek-v4-flash");
        row.setInputPriceLiPerMTok(1200L);
        row.setOutputPriceLiPerMTok(2300L);
        row.setUpstreamInputCostLiPerMTok(1008L);
        row.setUpstreamCacheCostLiPerMTok(20L);
        row.setUpstreamOutputCostLiPerMTok(2016L);
        row.setEffectiveFrom(LocalDateTime.ofInstant(Instant.parse("2020-01-01T00:00:00Z"), ZoneOffset.UTC));

        var item = BillingPortalApplication.toPriceItem(row);
        assertEquals("deepseek-v4-flash", item.getModel());
        assertEquals(BillingPortalPricesResponse.BILLING_UNIT_PER_MTOK, item.getBillingUnit());
        assertEquals(0, item.getInputPriceYuanPerMtok().compareTo(new BigDecimal("1.200")));
        assertEquals(0, item.getOutputPriceYuanPerMtok().compareTo(new BigDecimal("2.300")));
        assertNull(item.getPriceYuanPerCall());
        // 用户价高于上游 → 不展示划线原价
        assertNull(item.getListInputPriceYuanPerMtok());
        assertNull(item.getListOutputPriceYuanPerMtok());
        assertEquals(Instant.parse("2020-01-01T00:00:00Z"), item.getEffectiveFrom());
    }

    @Test
    void toPriceItemExposesListPriceOnlyWhenUserBelowUpstream() {
        TokenPriceRule row = new TokenPriceRule();
        row.setModel("promo-model");
        row.setInputPriceLiPerMTok(800L);
        row.setOutputPriceLiPerMTok(1500L);
        row.setUpstreamInputCostLiPerMTok(1000L);
        row.setUpstreamOutputCostLiPerMTok(2016L);

        var item = BillingPortalApplication.toPriceItem(row);
        assertEquals(0, item.getListInputPriceYuanPerMtok().compareTo(new BigDecimal("1.000")));
        assertEquals(0, item.getListOutputPriceYuanPerMtok().compareTo(new BigDecimal("2.016")));
    }

    @Test
    void toPerCallPriceItemDecodesSchemeAAndOmitsMtokFields() {
        TokenPriceRule row = new TokenPriceRule();
        row.setModel("tavily.search");
        row.setInputPriceLiPerMTok(100_000_000L); // 100 厘/次
        row.setOutputPriceLiPerMTok(0L);
        row.setUpstreamInputCostLiPerMTok(60_000_000L); // 用户价更高 → 无划线
        row.setEffectiveFrom(LocalDateTime.ofInstant(Instant.parse("2020-01-01T00:00:00Z"), ZoneOffset.UTC));

        var item = BillingPortalApplication.toPerCallPriceItem(row);
        assertEquals("tavily.search", item.getModel());
        assertEquals(BillingPortalPricesResponse.BILLING_UNIT_PER_CALL, item.getBillingUnit());
        assertEquals(0, item.getPriceYuanPerCall().compareTo(new BigDecimal("0.100")));
        assertNull(item.getInputPriceYuanPerMtok());
        assertNull(item.getOutputPriceYuanPerMtok());
        assertNull(item.getListPriceYuanPerCall());
        assertEquals(Instant.parse("2020-01-01T00:00:00Z"), item.getEffectiveFrom());
    }

    @Test
    void toPerCallPriceItemShowsListWhenUserBelowUpstream() {
        TokenPriceRule row = new TokenPriceRule();
        row.setModel("tavily.search");
        row.setInputPriceLiPerMTok(0L);
        row.setUpstreamInputCostLiPerMTok(60_000_000L); // 60 厘/次 = 0.060 元

        var item = BillingPortalApplication.toPerCallPriceItem(row);
        assertEquals(0, item.getPriceYuanPerCall().compareTo(new BigDecimal("0.000")));
        assertEquals(0, item.getListPriceYuanPerCall().compareTo(new BigDecimal("0.060")));
    }

    @Test
    void toPerCallPriceItemZeroSeedStillProducesZeroYuan() {
        TokenPriceRule row = priceRule("tavily.search", 0L, 0L);
        var item = BillingPortalApplication.toPerCallPriceItem(row);
        assertEquals(0, item.getPriceYuanPerCall().compareTo(new BigDecimal("0.000")));
    }

    @Test
    void listPricesSkipsUnpricedAndKeepsWhitelistOrder() {
        when(tokenPriceRuleDbService.findEffective(eq("deepseek-unpriced"), any())).thenReturn(null);
        when(tokenPriceRuleDbService.findEffective(eq("deepseek-v4-flash"), any()))
                .thenReturn(priceRule("deepseek-v4-flash", 1200L, 2300L));
        when(tokenPriceRuleDbService.findEffective(eq("deepseek-v4-pro"), any()))
                .thenReturn(priceRule("deepseek-v4-pro", 3600L, 7000L));
        when(tokenPriceRuleDbService.findEffective(eq("tavily.search"), any())).thenReturn(null);

        RechargeCaller caller = new RechargeCaller(1L, "t", "u", null, Instant.now().plusSeconds(60));
        BillingPortalPricesResponse body = app.listPrices(caller);
        assertEquals(2, body.getItems().size());
        assertEquals("deepseek-v4-flash", body.getItems().get(0).getModel());
        assertEquals(BillingPortalPricesResponse.BILLING_UNIT_PER_MTOK, body.getItems().get(0).getBillingUnit());
        assertEquals("deepseek-v4-pro", body.getItems().get(1).getModel());
        assertTrue(body.getAsOf() != null);
        assertEquals(0, body.getItems().get(0).getInputPriceYuanPerMtok().compareTo(new BigDecimal("1.200")));
    }

    @Test
    void listPricesAppendsSearchPerCallAfterModels() {
        when(tokenPriceRuleDbService.findEffective(eq("deepseek-unpriced"), any())).thenReturn(null);
        when(tokenPriceRuleDbService.findEffective(eq("deepseek-v4-flash"), any()))
                .thenReturn(priceRule("deepseek-v4-flash", 1200L, 2300L));
        when(tokenPriceRuleDbService.findEffective(eq("deepseek-v4-pro"), any()))
                .thenReturn(priceRule("deepseek-v4-pro", 3600L, 7000L));
        TokenPriceRule search = priceRule("tavily.search", 0L, 0L);
        search.setUpstreamInputCostLiPerMTok(60_000_000L);
        when(tokenPriceRuleDbService.findEffective(eq("tavily.search"), any())).thenReturn(search);

        RechargeCaller caller = new RechargeCaller(1L, "t", "u", null, Instant.now().plusSeconds(60));
        BillingPortalPricesResponse body = app.listPrices(caller);
        assertEquals(3, body.getItems().size());
        assertEquals("tavily.search", body.getItems().get(2).getModel());
        assertEquals(BillingPortalPricesResponse.BILLING_UNIT_PER_CALL, body.getItems().get(2).getBillingUnit());
        assertEquals(0, body.getItems().get(2).getPriceYuanPerCall().compareTo(new BigDecimal("0.000")));
        assertEquals(0, body.getItems().get(2).getListPriceYuanPerCall().compareTo(new BigDecimal("0.060")));
        assertNull(body.getItems().get(2).getInputPriceYuanPerMtok());
        assertNull(body.getItems().get(2).getOutputPriceYuanPerMtok());
    }

    @Test
    void toKeyItemOmitsHash() {
        TokenApiKey row = new TokenApiKey();
        row.setName("ftcs-desktop");
        row.setKeyPrefix("sk-Ab12CdEf");
        row.setKeyHash("deadbeef");
        row.setStatus("active");
        row.setCreatedAt(LocalDateTime.ofInstant(Instant.parse("2026-07-01T02:00:00Z"), ZoneOffset.UTC));
        row.setUpdatedAt(LocalDateTime.ofInstant(Instant.parse("2026-08-01T10:00:00Z"), ZoneOffset.UTC));

        var item = BillingPortalApplication.toKeyItem(row);
        assertEquals("ftcs-desktop", item.getName());
        assertEquals("sk-Ab12CdEf", item.getKeyPrefix());
        assertEquals("active", item.getStatus());
        assertEquals(Instant.parse("2026-07-01T02:00:00Z"), item.getCreatedAt());
        assertEquals(Instant.parse("2026-08-01T10:00:00Z"), item.getUpdatedAt());
    }

    @Test
    void toUcIdentityUsesPortalClientId() {
        RechargeCaller caller = new RechargeCaller(1L, "tenant-a", "u_code", 9L, Instant.now().plusSeconds(60));
        UcIdentity identity = BillingPortalApplication.toUcIdentity(caller);
        assertEquals("tenant-a", identity.getTenantId());
        assertEquals("u_code", identity.getUserCode());
        assertEquals("u_code", identity.getSubject());
        assertEquals("billing-portal", identity.getClientId());
    }

    @Test
    void listKeysReturnsEmptyWhenNoUser() {
        RechargeCaller caller = new RechargeCaller(1L, "t", "u", null, Instant.now().plusSeconds(60));
        when(tokenUserDbService.findByTenantIdAndUserCode("t", "u")).thenReturn(null);

        BillingPortalKeysResponse body = app.listKeys(caller);
        assertTrue(body.getItems().isEmpty());
    }

    @Test
    void listKeysMapsRows() {
        TokenUser user = new TokenUser();
        user.setId(9L);
        when(tokenUserDbService.getById(9L)).thenReturn(user);

        TokenApiKey row = new TokenApiKey();
        row.setName("ftcs-desktop");
        row.setKeyPrefix("sk-xxxx");
        row.setKeyHash("should-not-appear");
        row.setStatus("active");
        when(tokenApiKeyDbService.listByUserId(9L)).thenReturn(List.of(row));

        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        BillingPortalKeysResponse body = app.listKeys(caller);
        assertEquals(1, body.getItems().size());
        assertEquals("ftcs-desktop", body.getItems().get(0).getName());
        assertEquals("sk-xxxx", body.getItems().get(0).getKeyPrefix());
    }

    @Test
    void rotateKeyDelegatesToKeyRotateApplication() {
        TokenUser user = new TokenUser();
        user.setId(9L);
        when(tokenUserDbService.getById(9L)).thenReturn(user);

        TokenApiKey existing = new TokenApiKey();
        existing.setName("ftcs-desktop");
        when(tokenApiKeyDbService.findByUserIdAndName(9L, "ftcs-desktop")).thenReturn(existing);

        RechargeCaller caller = new RechargeCaller(1L, "tenant-a", "u_code", 9L, Instant.now().plusSeconds(60));
        KeyRotateResponse expected = new KeyRotateResponse();
        expected.setAction("rotated");
        expected.setApiKey("sk-secret");
        when(keyRotateApplication.rotate(any(UcIdentity.class), eq("ftcs-desktop"))).thenReturn(expected);

        KeyRotateResponse body = app.rotateKey(caller, "FTCS-Desktop");
        assertEquals("rotated", body.getAction());
        assertEquals("sk-secret", body.getApiKey());

        ArgumentCaptor<UcIdentity> idCap = ArgumentCaptor.forClass(UcIdentity.class);
        verify(keyRotateApplication).rotate(idCap.capture(), eq("ftcs-desktop"));
        assertEquals("billing-portal", idCap.getValue().getClientId());
        assertEquals("tenant-a", idCap.getValue().getTenantId());
    }

    @Test
    void rotateKeyRejectsUnknownName() {
        TokenUser user = new TokenUser();
        user.setId(9L);
        when(tokenUserDbService.getById(9L)).thenReturn(user);
        when(tokenApiKeyDbService.findByUserIdAndName(9L, "missing")).thenReturn(null);

        RechargeCaller caller = new RechargeCaller(1L, "t", "u", 9L, Instant.now().plusSeconds(60));
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> app.rotateKey(caller, "missing"));
        assertEquals("key_not_found", ex.getReason());
    }

    private static TokenPriceRule priceRule(String model, long inputLi, long outputLi) {
        TokenPriceRule row = new TokenPriceRule();
        row.setModel(model);
        row.setInputPriceLiPerMTok(inputLi);
        row.setOutputPriceLiPerMTok(outputLi);
        row.setUpstreamInputCostLiPerMTok(1L);
        row.setEffectiveFrom(LocalDateTime.ofInstant(Instant.parse("2020-01-01T00:00:00Z"), ZoneOffset.UTC));
        return row;
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
