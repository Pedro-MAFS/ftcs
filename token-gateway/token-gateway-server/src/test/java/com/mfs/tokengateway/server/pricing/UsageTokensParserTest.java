package com.mfs.tokengateway.server.pricing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

class UsageTokensParserTest {

    private final UsageTokensParser parser = new UsageTokensParser();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parsesDeepSeekCacheHit() {
        ObjectNode usage = mapper.createObjectNode();
        usage.put("prompt_tokens", 100);
        usage.put("completion_tokens", 20);
        usage.put("prompt_cache_hit_tokens", 40);
        usage.put("prompt_cache_miss_tokens", 60);

        UsageTokens tokens = parser.tryParse(usage).orElseThrow();
        assertEquals(100, tokens.promptTokens());
        assertEquals(20, tokens.completionTokens());
        assertEquals(40, tokens.cachedTokens());
        assertEquals(60, tokens.uncachedTokens());
    }

    @Test
    void defaultsCachedToZero() {
        ObjectNode usage = mapper.createObjectNode();
        usage.put("prompt_tokens", 10);
        usage.put("completion_tokens", 1);

        UsageTokens tokens = parser.tryParse(usage).orElseThrow();
        assertEquals(0, tokens.cachedTokens());
        assertEquals(10, tokens.uncachedTokens());
    }

    @Test
    void emptyWhenNoTokenFields() {
        assertTrue(parser.tryParse(mapper.createObjectNode()).isEmpty());
        assertEquals(Optional.empty(), parser.tryParse(null));
    }

    @Test
    void rejectsNegative() {
        ObjectNode usage = mapper.createObjectNode();
        usage.put("prompt_tokens", -1);
        assertThrows(IllegalArgumentException.class, () -> parser.tryParse(usage));
    }

    @Test
    void clampsCachedAbovePrompt() {
        ObjectNode usage = mapper.createObjectNode();
        usage.put("prompt_tokens", 10);
        usage.put("completion_tokens", 0);
        usage.put("prompt_cache_hit_tokens", 99);
        UsageTokens tokens = parser.tryParse(usage).orElseThrow();
        assertEquals(10, tokens.cachedTokens());
        assertEquals(0, tokens.uncachedTokens());
    }
}
