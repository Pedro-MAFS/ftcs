package com.mfs.tokengateway.admin.domain.price;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.mfs.tokengateway.admin.api.dto.AdminPriceCreateRequest;
import com.mfs.tokengateway.db.po.TokenPriceRule;

class PriceEncodingTest {

    @Test
    void chatPerMtokEncodesFiveTiers() {
        AdminPriceCreateRequest req = baseChat();
        req.setInputPriceLiPerMtok(1200L);
        req.setOutputPriceLiPerMtok(2300L);
        req.setUpstreamInputCostLiPerMtok(1008L);
        req.setUpstreamCacheCostLiPerMtok(20L);
        req.setUpstreamOutputCostLiPerMtok(2016L);

        TokenPriceRule row = PriceEncoding.toRow(req);
        assertEquals("deepseek-v4-flash", row.getModel());
        assertEquals(1200L, row.getInputPriceLiPerMTok());
        assertEquals(2300L, row.getOutputPriceLiPerMTok());
        assertEquals(1008L, row.getUpstreamInputCostLiPerMTok());
    }

    @Test
    void chatAcceptsYuanConvertedToLi() {
        AdminPriceCreateRequest req = baseChat();
        req.setInputPriceYuanPerMtok(new BigDecimal("1.200"));
        req.setOutputPriceYuanPerMtok(new BigDecimal("2.300"));
        req.setUpstreamInputCostYuanPerMtok(new BigDecimal("1.008"));
        req.setUpstreamCacheCostYuanPerMtok(new BigDecimal("0.020"));
        req.setUpstreamOutputCostYuanPerMtok(new BigDecimal("2.016"));

        TokenPriceRule row = PriceEncoding.toRow(req);
        assertEquals(1200L, row.getInputPriceLiPerMTok());
        assertEquals(2300L, row.getOutputPriceLiPerMTok());
        assertEquals(1008L, row.getUpstreamInputCostLiPerMTok());
        assertEquals(20L, row.getUpstreamCacheCostLiPerMTok());
        assertEquals(2016L, row.getUpstreamOutputCostLiPerMTok());
    }

    @Test
    void tavilyPerCallUsesSchemeA() {
        AdminPriceCreateRequest req = baseTavily();
        req.setPriceLiPerCall(100L);
        req.setCogsLiPerCall(60L);

        TokenPriceRule row = PriceEncoding.toRow(req);
        assertEquals(100L * PriceEncoding.PER_CALL_SCALE, row.getInputPriceLiPerMTok());
        assertEquals(0L, row.getOutputPriceLiPerMTok());
        assertEquals(60L * PriceEncoding.PER_CALL_SCALE, row.getUpstreamInputCostLiPerMTok());
        assertEquals(0L, row.getUpstreamCacheCostLiPerMTok());
        assertEquals(0L, row.getUpstreamOutputCostLiPerMTok());
        assertEquals(100L, PriceEncoding.storedToLiPerCall(row.getInputPriceLiPerMTok()));
        assertEquals(0, PriceEncoding.storedToYuanPerCall(row.getInputPriceLiPerMTok())
                .compareTo(new BigDecimal("0.100")));
    }

    @Test
    void tavilyRejectsPerMtok() {
        AdminPriceCreateRequest req = baseTavily();
        req.setBillingUnit(PriceBillingUnit.PER_MTOK);
        req.setInputPriceLiPerMtok(1200L);
        req.setOutputPriceLiPerMtok(0L);
        req.setUpstreamInputCostLiPerMtok(0L);
        req.setUpstreamCacheCostLiPerMtok(0L);
        req.setUpstreamOutputCostLiPerMtok(0L);

        AdminPriceException ex = assertThrows(AdminPriceException.class, () -> PriceEncoding.toRow(req));
        assertEquals("billing_unit_mismatch", ex.getCode());
    }

    @Test
    void chatRejectsPerCall() {
        AdminPriceCreateRequest req = baseChat();
        req.setBillingUnit(PriceBillingUnit.PER_CALL);
        req.setPriceLiPerCall(1L);
        req.setCogsLiPerCall(0L);

        AdminPriceException ex = assertThrows(AdminPriceException.class, () -> PriceEncoding.toRow(req));
        assertEquals("billing_unit_mismatch", ex.getCode());
    }

    @Test
    void outOfRangeMtok() {
        AdminPriceCreateRequest req = baseChat();
        req.setInputPriceLiPerMtok(PriceEncoding.MAX_LI_PER_MTOK + 1);
        req.setOutputPriceLiPerMtok(0L);
        req.setUpstreamInputCostLiPerMtok(0L);
        req.setUpstreamCacheCostLiPerMtok(0L);
        req.setUpstreamOutputCostLiPerMtok(0L);

        AdminPriceException ex = assertThrows(AdminPriceException.class, () -> PriceEncoding.toRow(req));
        assertEquals("price_out_of_range", ex.getCode());
    }

    @Test
    void liYuanConflict() {
        AdminPriceCreateRequest req = baseChat();
        req.setInputPriceLiPerMtok(1200L);
        req.setInputPriceYuanPerMtok(new BigDecimal("9.000"));
        req.setOutputPriceLiPerMtok(0L);
        req.setUpstreamInputCostLiPerMtok(0L);
        req.setUpstreamCacheCostLiPerMtok(0L);
        req.setUpstreamOutputCostLiPerMtok(0L);

        AdminPriceException ex = assertThrows(AdminPriceException.class, () -> PriceEncoding.toRow(req));
        assertEquals("validation_error", ex.getCode());
    }

    private static AdminPriceCreateRequest baseChat() {
        AdminPriceCreateRequest req = new AdminPriceCreateRequest();
        req.setModel("deepseek-v4-flash");
        req.setBillingUnit(PriceBillingUnit.PER_MTOK);
        req.setEffectiveFrom(Instant.parse("2026-09-01T00:00:00Z"));
        req.setOperator("tester");
        req.setNote("unit-test");
        return req;
    }

    private static AdminPriceCreateRequest baseTavily() {
        AdminPriceCreateRequest req = new AdminPriceCreateRequest();
        req.setModel(PriceEncoding.TAVILY_SEARCH);
        req.setBillingUnit(PriceBillingUnit.PER_CALL);
        req.setEffectiveFrom(Instant.parse("2026-09-01T00:00:00Z"));
        req.setOperator("tester");
        req.setNote("unit-test");
        return req;
    }
}
