package com.mfs.tokengateway.server.pricing;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;

/** 解析上游 Chat usage JSON（DeepSeek 字段优先）。 */
@Component
public class UsageTokensParser {

    private static final Logger log = LoggerFactory.getLogger(UsageTokensParser.class);

    /**
     * @return 无 usage 或缺少 token 字段时 empty；负 token 抛 {@link IllegalArgumentException}
     */
    public Optional<UsageTokens> tryParse(JsonNode usage) {
        if (usage == null || usage.isNull() || usage.isMissingNode() || !usage.isObject()) {
            return Optional.empty();
        }
        boolean hasPrompt = usage.has("prompt_tokens") && !usage.get("prompt_tokens").isNull();
        boolean hasCompletion = usage.has("completion_tokens") && !usage.get("completion_tokens").isNull();
        if (!hasPrompt && !hasCompletion) {
            return Optional.empty();
        }

        int prompt = hasPrompt ? requireNonNegative(usage.get("prompt_tokens"), "prompt_tokens") : 0;
        int completion =
                hasCompletion ? requireNonNegative(usage.get("completion_tokens"), "completion_tokens") : 0;

        int cached = 0;
        if (usage.has("prompt_cache_hit_tokens") && !usage.get("prompt_cache_hit_tokens").isNull()) {
            cached = requireNonNegative(usage.get("prompt_cache_hit_tokens"), "prompt_cache_hit_tokens");
        } else {
            JsonNode details = usage.get("prompt_tokens_details");
            if (details != null && details.isObject() && details.has("cached_tokens")
                    && !details.get("cached_tokens").isNull()) {
                cached = requireNonNegative(details.get("cached_tokens"), "cached_tokens");
            }
        }

        if (cached > prompt) {
            log.warn("cached_tokens {} > prompt_tokens {}; clamping", cached, prompt);
            cached = prompt;
        }
        int uncached = Math.max(prompt - cached, 0);
        return Optional.of(new UsageTokens(prompt, completion, cached, uncached));
    }

    private static int requireNonNegative(JsonNode node, String field) {
        if (!node.isNumber()) {
            throw new IllegalArgumentException("invalid_usage: " + field + " not number");
        }
        int v = node.intValue();
        if (v < 0) {
            throw new IllegalArgumentException("invalid_usage: " + field + " negative");
        }
        return v;
    }
}
