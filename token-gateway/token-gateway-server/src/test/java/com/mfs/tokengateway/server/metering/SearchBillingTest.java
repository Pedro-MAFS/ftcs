package com.mfs.tokengateway.server.metering;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mfs.tokengateway.server.pricing.PricingCalculator;
import com.mfs.tokengateway.server.pricing.PriceRuleSnapshot;
import com.mfs.tokengateway.server.pricing.UsageTokens;
import com.mfs.tokengateway.server.pricing.UsageTokensParser;

class SearchBillingTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final UsageTokensParser parser = new UsageTokensParser();
    private final PricingCalculator calculator = new PricingCalculator();

    @Test
    void perCallUsageParsesToOneUncachedToken() {
        JsonNode usage = SearchBilling.perCallUsage(mapper);
        UsageTokens tokens = parser.tryParse(usage).orElseThrow();
        assertEquals(1, tokens.promptTokens());
        assertEquals(0, tokens.completionTokens());
        assertEquals(0, tokens.cachedTokens());
        assertEquals(1, tokens.uncachedTokens());
    }

    @Test
    void seedEncodingYieldsZeroRevenueAndSixtyLiCogs() {
        // user 0 li/call; cogs 60 li/call (= 6 fen)
        PriceRuleSnapshot price = new PriceRuleSnapshot(
                1L,
                SearchBilling.MODEL,
                null,
                0L,
                0L,
                60_000_000L,
                0L,
                0L);
        var quote = calculator.quote(price, new UsageTokens(1, 0, 0, 1));
        assertEquals(0L, quote.revenueLi());
        assertEquals(60L, quote.cogsLi());
        assertEquals(-60L, quote.marginLi());
    }

    @Test
    void summariesNeverEmbedQueryText() {
        String success = SearchBilling.successSummary("basic", 3);
        assertEquals("depth=basic;results=3", success);
        assertFalse(success.toLowerCase().contains("query"));

        String err = SearchBilling.errorSummary("basic", "upstream_timeout");
        assertEquals("depth=basic;code=upstream_timeout", err);
        assertFalse(err.contains("secret-query"));
    }
}
