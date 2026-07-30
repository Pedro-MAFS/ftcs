package com.mfs.tokengateway.server.pricing;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

class PricingCalculatorTest {

    private final PricingCalculator calculator = new PricingCalculator();

    private static PriceRuleSnapshot price(long pin, long pout, long cin, long ccache, long cout) {
        return new PriceRuleSnapshot(
                1L,
                "deepseek-v4-flash",
                LocalDateTime.of(2020, 1, 1, 0, 0),
                pin,
                pout,
                cin,
                ccache,
                cout);
    }

    @Test
    void revenueUsesFullPromptEvenWithCache() {
        PriceRuleSnapshot p = price(1000, 2000, 800, 10, 1500);
        UsageTokens noCache = new UsageTokens(1_000_000, 0, 0, 1_000_000);
        UsageTokens withCache = new UsageTokens(1_000_000, 0, 500_000, 500_000);

        BillingQuote a = calculator.quote(p, noCache);
        BillingQuote b = calculator.quote(p, withCache);

        assertEquals(1000L, a.revenueLi());
        assertEquals(1000L, b.revenueLi());
        assertEquals(800L, a.cogsLi());
        assertEquals(405L, b.cogsLi()); // (500000*800 + 500000*10) / 1e6 = 405
        assertEquals(a.revenueLi() - a.cogsLi(), a.marginLi());
    }

    @Test
    void halfUpRounding() {
        // 1 * 500_000 / 1_000_000 = 0.5 → 1
        PriceRuleSnapshot p = price(500_000, 0, 0, 0, 0);
        BillingQuote q = calculator.quote(p, new UsageTokens(1, 0, 0, 1));
        assertEquals(1L, q.revenueLi());
    }

    @Test
    void allowsZeroRevenue() {
        PriceRuleSnapshot p = price(1, 1, 1, 1, 1);
        BillingQuote q = calculator.quote(p, new UsageTokens(1, 1, 0, 1));
        assertEquals(0L, q.revenueLi());
        assertEquals(0L, q.cogsLi());
    }
}
