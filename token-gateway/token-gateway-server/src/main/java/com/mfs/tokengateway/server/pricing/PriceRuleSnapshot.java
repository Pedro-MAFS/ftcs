package com.mfs.tokengateway.server.pricing;

import java.time.LocalDateTime;

/**
 * 生效价目快照；单价均为厘 / 百万 Token。
 */
public record PriceRuleSnapshot(
        long ruleId,
        String model,
        LocalDateTime effectiveFrom,
        long inputPriceLiPerMTok,
        long outputPriceLiPerMTok,
        long upstreamInputCostLiPerMTok,
        long upstreamCacheCostLiPerMTok,
        long upstreamOutputCostLiPerMTok) {
}
