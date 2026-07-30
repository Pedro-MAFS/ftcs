package com.mfs.tokengateway.server.pricing;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.springframework.stereotype.Service;

import com.mfs.tokengateway.db.dbservice.TokenPriceRuleDbService;
import com.mfs.tokengateway.db.po.TokenPriceRule;

/**
 * 价目解析与报价门面（US-G0-09）。供异步结算与单测；Chat 热路径禁止注入调用 {@link #quote}。
 */
@Service
public class PricingService {

    private final TokenPriceRuleDbService priceRuleDbService;
    private final PricingCalculator pricingCalculator;

    public PricingService(TokenPriceRuleDbService priceRuleDbService, PricingCalculator pricingCalculator) {
        this.priceRuleDbService = priceRuleDbService;
        this.pricingCalculator = pricingCalculator;
    }

    public PriceRuleSnapshot resolve(String model, Instant asOf) {
        LocalDateTime asOfUtc = LocalDateTime.ofInstant(asOf, ZoneOffset.UTC);
        TokenPriceRule row = priceRuleDbService.findEffective(model, asOfUtc);
        if (row == null) {
            throw new PriceRuleNotFoundException(model);
        }
        return toSnapshot(row);
    }

    public BillingQuote quote(PriceRuleSnapshot price, UsageTokens usage) {
        return pricingCalculator.quote(price, usage);
    }

    public BillingQuote quote(String model, Instant asOf, UsageTokens usage) {
        return quote(resolve(model, asOf), usage);
    }

    private static PriceRuleSnapshot toSnapshot(TokenPriceRule row) {
        return new PriceRuleSnapshot(
                row.getId(),
                row.getModel(),
                row.getEffectiveFrom(),
                row.getInputPriceLiPerMTok(),
                row.getOutputPriceLiPerMTok(),
                row.getUpstreamInputCostLiPerMTok(),
                row.getUpstreamCacheCostLiPerMTok(),
                row.getUpstreamOutputCostLiPerMTok());
    }
}
