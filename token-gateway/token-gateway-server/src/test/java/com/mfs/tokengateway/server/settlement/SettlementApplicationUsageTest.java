package com.mfs.tokengateway.server.settlement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.server.pricing.UsageTokens;

class SettlementApplicationUsageTest {

    @Test
    void usageFromLogColumns() {
        TokenRequestLog row = new TokenRequestLog();
        row.setPromptTokens(100);
        row.setCompletionTokens(20);
        row.setCachedTokens(40);
        row.setUncachedTokens(60);
        UsageTokens u = SettlementApplication.usageFromLog(row);
        assertEquals(100, u.promptTokens());
        assertEquals(20, u.completionTokens());
        assertEquals(40, u.cachedTokens());
        assertEquals(60, u.uncachedTokens());
    }

    @Test
    void rejectsMissingTokens() {
        assertThrows(
                IllegalArgumentException.class,
                () -> SettlementApplication.usageFromLog(new TokenRequestLog()));
    }
}
