package com.mfs.tokengateway.admin.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import org.springframework.dao.DataIntegrityViolationException;

import com.mfs.tokengateway.admin.api.dto.AdminPriceCreateRequest;
import com.mfs.tokengateway.admin.api.dto.AdminPriceListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminPriceListResponse.AdminPriceItem;
import com.mfs.tokengateway.admin.config.AdminProperties;
import com.mfs.tokengateway.admin.domain.price.AdminPriceException;
import com.mfs.tokengateway.admin.domain.price.PriceBillingUnit;
import com.mfs.tokengateway.admin.domain.price.PriceEncoding;
import com.mfs.tokengateway.db.dbservice.TokenPriceRuleDbService;
import com.mfs.tokengateway.db.po.TokenPriceRule;

@ExtendWith(MockitoExtension.class)
class AdminPriceApplicationTest {

    @Mock
    private TokenPriceRuleDbService priceRuleDbService;

    private AdminPriceApplication app;

    @BeforeEach
    void setUp() {
        app = new AdminPriceApplication(priceRuleDbService, new AdminProperties());
    }

    @Test
    void listCurrentOnlyReturnsOnePerModel() {
        Instant asOf = Instant.parse("2026-08-01T00:00:00Z");
        TokenPriceRule old = rule("deepseek-v4-flash", 1L, "2020-01-01T00:00:00", 1000L);
        TokenPriceRule cur = rule("deepseek-v4-flash", 2L, "2026-07-01T00:00:00", 1200L);
        TokenPriceRule future = rule("deepseek-v4-flash", 3L, "2026-12-01T00:00:00", 1300L);
        when(priceRuleDbService.listAllOrderByModelFromDesc()).thenReturn(List.of(future, cur, old));

        AdminPriceListResponse resp = app.list(null, false, true, asOf);
        assertEquals(1, resp.getItems().size());
        assertEquals(2L, resp.getItems().get(0).getId());
        assertEquals(AdminPriceApplication.STATUS_CURRENT, resp.getItems().get(0).getStatus());
    }

    @Test
    void listHistoryIncludesScheduled() {
        Instant asOf = Instant.parse("2026-08-01T00:00:00Z");
        TokenPriceRule old = rule("deepseek-v4-flash", 1L, "2020-01-01T00:00:00", 1000L);
        TokenPriceRule cur = rule("deepseek-v4-flash", 2L, "2026-07-01T00:00:00", 1200L);
        TokenPriceRule future = rule("deepseek-v4-flash", 3L, "2026-12-01T00:00:00", 1300L);
        when(priceRuleDbService.listAllOrderByModelFromDesc()).thenReturn(List.of(future, cur, old));

        AdminPriceListResponse resp = app.list(null, true, true, asOf);
        assertEquals(3, resp.getItems().size());
        assertEquals(AdminPriceApplication.STATUS_SCHEDULED, resp.getItems().get(0).getStatus());
        assertEquals(AdminPriceApplication.STATUS_CURRENT, resp.getItems().get(1).getStatus());
        assertEquals(AdminPriceApplication.STATUS_HISTORY, resp.getItems().get(2).getStatus());
    }

    @Test
    void createTavilyAndAuditPath() {
        AdminPriceCreateRequest req = new AdminPriceCreateRequest();
        req.setModel(PriceEncoding.TAVILY_SEARCH);
        req.setBillingUnit(PriceBillingUnit.PER_CALL);
        req.setEffectiveFrom(Instant.parse("2026-09-01T00:00:00Z"));
        req.setOperator("ops");
        req.setNote("adjust");
        req.setPriceLiPerCall(100L);
        req.setCogsLiPerCall(60L);

        when(priceRuleDbService.insertNew(any())).thenAnswer(inv -> {
            TokenPriceRule r = inv.getArgument(0);
            r.setId(99L);
            return true;
        });
        when(priceRuleDbService.listByModelOrderByFromDesc(PriceEncoding.TAVILY_SEARCH))
                .thenAnswer(inv -> {
                    TokenPriceRule r = rule(PriceEncoding.TAVILY_SEARCH, 99L, "2026-09-01T00:00:00", 100_000_000L);
                    r.setUpstreamInputCostLiPerMTok(60_000_000L);
                    return List.of(r);
                });

        AdminPriceItem item = app.create(req, "127.0.0.1");
        assertEquals(99L, item.getId());
        assertEquals("per_call", item.getBillingUnit());
        assertEquals(100L, item.getPriceLiPerCall());

        ArgumentCaptor<TokenPriceRule> cap = ArgumentCaptor.forClass(TokenPriceRule.class);
        verify(priceRuleDbService).insertNew(cap.capture());
        assertEquals(100L * PriceEncoding.PER_CALL_SCALE, cap.getValue().getInputPriceLiPerMTok());
    }

    @Test
    void createRejectsUnknownModel() {
        AdminPriceCreateRequest req = new AdminPriceCreateRequest();
        req.setModel("gpt-secret");
        req.setBillingUnit(PriceBillingUnit.PER_MTOK);
        req.setEffectiveFrom(Instant.parse("2026-09-01T00:00:00Z"));
        req.setOperator("ops");
        req.setNote("x");
        req.setInputPriceLiPerMtok(1L);
        req.setOutputPriceLiPerMtok(1L);
        req.setUpstreamInputCostLiPerMtok(1L);
        req.setUpstreamCacheCostLiPerMtok(0L);
        req.setUpstreamOutputCostLiPerMtok(1L);

        AdminPriceException ex = assertThrows(AdminPriceException.class, () -> app.create(req, null));
        assertEquals("model_not_allowed", ex.getCode());
    }

    @Test
    void createMapsDuplicateTo409() {
        AdminPriceCreateRequest req = new AdminPriceCreateRequest();
        req.setModel("deepseek-v4-flash");
        req.setBillingUnit(PriceBillingUnit.PER_MTOK);
        req.setEffectiveFrom(Instant.parse("2026-09-01T00:00:00Z"));
        req.setOperator("ops");
        req.setNote("x");
        req.setInputPriceLiPerMtok(1L);
        req.setOutputPriceLiPerMtok(1L);
        req.setUpstreamInputCostLiPerMtok(1L);
        req.setUpstreamCacheCostLiPerMtok(0L);
        req.setUpstreamOutputCostLiPerMtok(1L);

        when(priceRuleDbService.insertNew(any())).thenThrow(new DataIntegrityViolationException("uk"));

        AdminPriceException ex = assertThrows(AdminPriceException.class, () -> app.create(req, null));
        assertEquals("price_version_conflict", ex.getCode());
        assertTrue(ex.getStatus().is4xxClientError());
    }

    private static TokenPriceRule rule(String model, long id, String from, long input) {
        TokenPriceRule r = new TokenPriceRule();
        r.setId(id);
        r.setModel(model);
        r.setEffectiveFrom(LocalDateTime.parse(from));
        r.setCreatedAt(LocalDateTime.ofInstant(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC));
        r.setInputPriceLiPerMTok(input);
        r.setOutputPriceLiPerMTok(0L);
        r.setUpstreamInputCostLiPerMTok(0L);
        r.setUpstreamCacheCostLiPerMTok(0L);
        r.setUpstreamOutputCostLiPerMTok(0L);
        return r;
    }
}
