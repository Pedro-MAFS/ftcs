package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.mfs.tokengateway.db.dbservice.TokenPriceRuleDbService;
import com.mfs.tokengateway.db.po.TokenPriceRule;
import com.mfs.tokengateway.server.api.dto.ModelsListResponse;
import com.mfs.tokengateway.server.upstream.ModelWhitelist;

@ExtendWith(MockitoExtension.class)
class ModelsApplicationTest {

    @Mock
    private TokenPriceRuleDbService tokenPriceRuleDbService;

    private ModelsApplication application;

    @BeforeEach
    void setUp() {
        ModelWhitelist whitelist =
                new ModelWhitelist(Set.of("deepseek-v4-pro", "deepseek-v4-flash", "unpriced-model"));
        application = new ModelsApplication(whitelist, tokenPriceRuleDbService);
    }

    @Test
    void returnsIntersectionSorted() {
        when(tokenPriceRuleDbService.findEffective(eq("deepseek-v4-flash"), any()))
                .thenReturn(new TokenPriceRule());
        when(tokenPriceRuleDbService.findEffective(eq("deepseek-v4-pro"), any()))
                .thenReturn(new TokenPriceRule());
        when(tokenPriceRuleDbService.findEffective(eq("unpriced-model"), any())).thenReturn(null);

        ModelsListResponse body = application.listAvailable();
        assertEquals("list", body.getObject());
        assertEquals(2, body.getData().size());
        assertEquals(
                List.of("deepseek-v4-flash", "deepseek-v4-pro"),
                body.getData().stream().map(ModelsListResponse.ModelItem::getId).toList());
        assertEquals("deepseek", body.getData().get(0).getOwnedBy());
    }

    @Test
    void emptyWhenNonePriced() {
        when(tokenPriceRuleDbService.findEffective(any(), any())).thenReturn(null);
        assertEquals(0, application.listAvailable().getData().size());
    }
}
