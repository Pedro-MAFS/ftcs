package com.mfs.tokengateway.server.metering;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.server.pricing.UsageTokens;
import com.mfs.tokengateway.server.pricing.UsageTokensParser;
import com.mfs.tokengateway.server.security.ChatCaller;
import com.mfs.tokengateway.server.web.RequestIds;

/**
 * Chat 结束写 {@code token_request_logs}（不算价、不扣费）。写失败只打日志，不影响已返回客户端的响应。
 */
@Service
public class RequestMeterService {

    public static final String STATUS_SUCCESS = "success";
    public static final String STATUS_ERROR = "error";
    public static final String STATUS_INTERRUPTED = "interrupted";

    public static final String BILLING_PENDING = "pending";
    public static final String BILLING_SKIPPED = "skipped_no_usage";

    private static final Logger log = LoggerFactory.getLogger(RequestMeterService.class);

    private final TokenRequestLogDbService requestLogDbService;
    private final UsageTokensParser usageTokensParser;

    public RequestMeterService(
            TokenRequestLogDbService requestLogDbService, UsageTokensParser usageTokensParser) {
        this.requestLogDbService = requestLogDbService;
        this.usageTokensParser = usageTokensParser;
    }

    public void record(RequestMeterCommand command) {
        if (command == null) {
            return;
        }
        ChatCaller caller = command.caller();
        if (caller == null) {
            log.warn("skip request meter: missing ChatCaller requestId={}", command.requestId());
            return;
        }
        if (command.model() == null || command.model().isBlank()) {
            log.warn("skip request meter: missing model requestId={}", command.requestId());
            return;
        }

        String requestId =
                command.requestId() == null || command.requestId().isBlank()
                        ? RequestIds.newId()
                        : command.requestId();

        UsageTokens tokens = null;
        try {
            tokens = usageTokensParser.tryParse(command.usage()).orElse(null);
        } catch (IllegalArgumentException e) {
            log.warn("invalid usage for meter requestId={}: {}", requestId, e.getMessage());
        }

        String billing = tokens != null ? BILLING_PENDING : BILLING_SKIPPED;

        TokenRequestLog row = new TokenRequestLog();
        row.setRequestId(requestId);
        row.setUserId(caller.getUserId());
        row.setKeyId(caller.getKeyId());
        row.setKeyName(caller.getKeyName());
        row.setModel(command.model());
        row.setStatus(command.status());
        if (tokens != null) {
            row.setPromptTokens(tokens.promptTokens());
            row.setCompletionTokens(tokens.completionTokens());
            row.setCachedTokens(tokens.cachedTokens());
            row.setUncachedTokens(tokens.uncachedTokens());
        }
        row.setRevenueLi(null);
        row.setCogsLi(null);
        row.setMarginLi(null);
        row.setLatencyMs(command.latencyMs());
        row.setUpstreamStatus(command.upstreamStatus());
        row.setErrorSummary(truncate(command.errorSummary(), 512));
        row.setBillingStatus(billing);

        try {
            requestLogDbService.insertLog(row);
        } catch (Exception e) {
            log.error(
                    "failed to insert token_request_logs requestId={}: {}",
                    requestId,
                    e.toString());
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        if (value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }
}
