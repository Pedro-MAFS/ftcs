package com.mfs.tokengateway.server.pricing;

/**
 * §7.1 报价结果（整数厘）；供异步结算（G0-10）使用，Chat 热路径禁止调用。
 */
public record BillingQuote(long revenueLi, long cogsLi, long marginLi, UsageTokens usage, PriceRuleSnapshot price) {
}
