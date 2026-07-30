package com.mfs.tokengateway.server.pricing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.mfs.tokengateway.db.dbservice.TokenPriceRuleDbService;
import com.mfs.tokengateway.db.po.TokenPriceRule;

@ExtendWith(MockitoExtension.class)
class PricingServiceTest {

    @Mock
    private TokenPriceRuleDbService priceRuleDbService;

    @Mock
    private PricingCalculator pricingCalculator;

    @InjectMocks
    private PricingService pricingService;

    @Test
    void resolveThrowsWhenMissing() {
        when(priceRuleDbService.findEffective(eq("m"), any())).thenReturn(null);
        assertThrows(
                PriceRuleNotFoundException.class,
                () -> pricingService.resolve("m", Instant.parse("2026-01-01T00:00:00Z")));
    }

    @Test
    void resolveMapsRow() {
        TokenPriceRule row = new TokenPriceRule();
        row.setId(9L);
        row.setModel("deepseek-v4-flash");
        row.setEffectiveFrom(LocalDateTime.of(2020, 1, 1, 0, 0));
        row.setInputPriceLiPerMTok(1L);
        row.setOutputPriceLiPerMTok(2L);
        row.setUpstreamInputCostLiPerMTok(3L);
        row.setUpstreamCacheCostLiPerMTok(4L);
        row.setUpstreamOutputCostLiPerMTok(5L);
        Instant asOf = Instant.parse("2026-07-01T00:00:00Z");
        when(priceRuleDbService.findEffective(
                        "deepseek-v4-flash", LocalDateTime.ofInstant(asOf, ZoneOffset.UTC)))
                .thenReturn(row);

        PriceRuleSnapshot snap = pricingService.resolve("deepseek-v4-flash", asOf);
        assertEquals(9L, snap.ruleId());
        assertEquals(1L, snap.inputPriceLiPerMTok());
        verify(priceRuleDbService)
                .findEffective("deepseek-v4-flash", LocalDateTime.ofInstant(asOf, ZoneOffset.UTC));
    }
}
