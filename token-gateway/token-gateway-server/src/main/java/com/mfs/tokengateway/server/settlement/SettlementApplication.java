package com.mfs.tokengateway.server.settlement;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.pricing.BillingQuote;
import com.mfs.tokengateway.server.pricing.PriceRuleNotFoundException;
import com.mfs.tokengateway.server.pricing.PricingService;
import com.mfs.tokengateway.server.pricing.UsageTokens;

/**
 * 异步结算：认领 → 报价 → 按用户合并一次余额扣减（US-G0-10）。
 */
@Service
public class SettlementApplication {

    private static final Logger log = LoggerFactory.getLogger(SettlementApplication.class);

    private final TokenRequestLogDbService requestLogDbService;
    private final PricingService pricingService;
    private final SettlementTxnService settlementTxnService;
    private final TokenGatewayProperties properties;
    private final String instanceId;

    public SettlementApplication(
            TokenRequestLogDbService requestLogDbService,
            PricingService pricingService,
            SettlementTxnService settlementTxnService,
            TokenGatewayProperties properties) {
        this.requestLogDbService = requestLogDbService;
        this.pricingService = pricingService;
        this.settlementTxnService = settlementTxnService;
        this.properties = properties;
        String configured = properties.getSettlement().getInstanceId();
        this.instanceId =
                configured == null || configured.isBlank() ? UUID.randomUUID().toString() : configured.trim();
    }

    public String getInstanceId() {
        return instanceId;
    }

    public void settleBatch() {
        TokenGatewayProperties.Settlement cfg = properties.getSettlement();
        LocalDateTime staleBefore = LocalDateTime.now().minus(cfg.getClaimTimeout());
        int reclaimed = requestLogDbService.reclaimStaleSettling(staleBefore);
        if (reclaimed > 0) {
            log.info("settlement reclaimed stale settling rows count={}", reclaimed);
        }

        List<TokenRequestLog> claimed =
                requestLogDbService.claimPending(instanceId, cfg.getBatchSize());
        if (claimed.isEmpty()) {
            return;
        }

        List<QuotedItem> okItems = new ArrayList<>();
        for (TokenRequestLog row : claimed) {
            try {
                BillingQuote quote = quoteRow(row);
                okItems.add(new QuotedItem(row, quote));
            } catch (PriceRuleNotFoundException e) {
                log.error(
                        "settlement settle_failed price_rule_not_found requestId={} model={}",
                        row.getRequestId(),
                        row.getModel());
                requestLogDbService.markSettleFailedIfSettling(row.getRequestId(), instanceId);
            } catch (IllegalArgumentException e) {
                log.error(
                        "settlement settle_failed invalid_usage requestId={}: {}",
                        row.getRequestId(),
                        e.getMessage());
                requestLogDbService.markSettleFailedIfSettling(row.getRequestId(), instanceId);
            } catch (RuntimeException e) {
                log.warn(
                        "settlement quote transient failure requestId={}: {}",
                        row.getRequestId(),
                        e.toString());
            }
        }

        Map<Long, List<QuotedItem>> byUser = new LinkedHashMap<>();
        for (QuotedItem item : okItems) {
            byUser.computeIfAbsent(item.log().getUserId(), k -> new ArrayList<>()).add(item);
        }
        for (Map.Entry<Long, List<QuotedItem>> e : byUser.entrySet()) {
            try {
                settlementTxnService.settleUserBatch(instanceId, e.getKey(), e.getValue());
            } catch (RuntimeException ex) {
                log.warn(
                        "settlement user batch failed userId={} size={}: {}",
                        e.getKey(),
                        e.getValue().size(),
                        ex.toString());
            }
        }
    }

    BillingQuote quoteRow(TokenRequestLog row) {
        UsageTokens usage = usageFromLog(row);
        Instant asOf = toInstant(row.getCreatedAt());
        return pricingService.quote(row.getModel(), asOf, usage);
    }

    static UsageTokens usageFromLog(TokenRequestLog row) {
        if (row.getPromptTokens() == null && row.getCompletionTokens() == null) {
            throw new IllegalArgumentException("missing_token_columns");
        }
        int prompt = row.getPromptTokens() == null ? 0 : row.getPromptTokens();
        int completion = row.getCompletionTokens() == null ? 0 : row.getCompletionTokens();
        if (prompt < 0 || completion < 0) {
            throw new IllegalArgumentException("negative_tokens");
        }
        int cached = row.getCachedTokens() == null ? 0 : row.getCachedTokens();
        if (cached < 0) {
            throw new IllegalArgumentException("negative_cached");
        }
        if (cached > prompt) {
            cached = prompt;
        }
        int uncached = row.getUncachedTokens() != null
                ? Math.max(row.getUncachedTokens(), 0)
                : Math.max(prompt - cached, 0);
        return new UsageTokens(prompt, completion, cached, uncached);
    }

    private static Instant toInstant(LocalDateTime createdAt) {
        if (createdAt == null) {
            return Instant.now();
        }
        return createdAt.toInstant(ZoneOffset.UTC);
    }

    public record QuotedItem(TokenRequestLog log, BillingQuote quote) {
    }
}
