package com.mfs.tokengateway.server.pricing;

/**
 * 上游 usage 归一化计量（US-G0-09）。
 *
 * @param promptTokens     I
 * @param completionTokens O
 * @param cachedTokens     I_c
 * @param uncachedTokens   I_u = max(I - I_c, 0)
 */
public record UsageTokens(int promptTokens, int completionTokens, int cachedTokens, int uncachedTokens) {
}
