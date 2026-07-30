package com.mfs.tokengateway.server.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.stereotype.Component;

/** 需求 §7.1 两档售价 + 三档 COGS；纯函数。 */
@Component
public class PricingCalculator {

    private static final BigDecimal MILLION = BigDecimal.valueOf(1_000_000L);

    public BillingQuote quote(PriceRuleSnapshot price, UsageTokens usage) {
        long revenue = roundHalfUpDivMillion(
                mul(usage.promptTokens(), price.inputPriceLiPerMTok())
                        .add(mul(usage.completionTokens(), price.outputPriceLiPerMTok())));
        long cogs = roundHalfUpDivMillion(
                mul(usage.uncachedTokens(), price.upstreamInputCostLiPerMTok())
                        .add(mul(usage.cachedTokens(), price.upstreamCacheCostLiPerMTok()))
                        .add(mul(usage.completionTokens(), price.upstreamOutputCostLiPerMTok())));
        return new BillingQuote(revenue, cogs, revenue - cogs, usage, price);
    }

    private static BigDecimal mul(int tokens, long priceLiPerMTok) {
        return BigDecimal.valueOf(tokens).multiply(BigDecimal.valueOf(priceLiPerMTok));
    }

    private static long roundHalfUpDivMillion(BigDecimal numerator) {
        return numerator.divide(MILLION, 0, RoundingMode.HALF_UP).longValueExact();
    }
}
