package com.mfs.tokengateway.server.metering;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * 搜索按次计量约定（US-G5-03 方案 A）：伪 model + 合成 1 tok usage。
 * 价目编码：{@code input_price_li_per_mTok = 厘/次 × 1e6}（US-G5-04 面板解码）。
 */
public final class SearchBilling {

    public static final String MODEL = "tavily.search";
    public static final String SEARCH_DEPTH_BASIC = "basic";

    /** 方案 A：厘/百万 Token 存储倍率 = 厘/次 × 该常数。 */
    public static final long LI_PER_CALL_TO_LI_PER_MTOK = 1_000_000L;

    private SearchBilling() {
    }

    /**
     * 将价目表中的 {@code input_price_li_per_mTok} 解码为用户侧厘/次。
     */
    public static long decodeLiPerCall(long inputPriceLiPerMTok) {
        return BigDecimal.valueOf(inputPriceLiPerMTok)
                .divide(BigDecimal.valueOf(LI_PER_CALL_TO_LI_PER_MTOK), 0, RoundingMode.HALF_UP)
                .longValueExact();
    }

    /** 合成 usage，使 {@link UsageTokensParser} 得到 (1,0,0,1)。 */
    public static JsonNode perCallUsage(ObjectMapper mapper) {
        ObjectNode usage = mapper.createObjectNode();
        usage.put("prompt_tokens", 1);
        usage.put("completion_tokens", 0);
        ObjectNode details = usage.putObject("prompt_tokens_details");
        details.put("cached_tokens", 0);
        return usage;
    }

    public static String successSummary(String searchDepth, int resultCount) {
        return "depth=" + safeDepth(searchDepth) + ";results=" + Math.max(resultCount, 0);
    }

    public static String errorSummary(String searchDepth, String code) {
        String c = code == null || code.isBlank() ? "error" : code.trim();
        if (c.length() > 64) {
            c = c.substring(0, 64);
        }
        return "depth=" + safeDepth(searchDepth) + ";code=" + c;
    }

    private static String safeDepth(String searchDepth) {
        if (searchDepth == null || searchDepth.isBlank()) {
            return SEARCH_DEPTH_BASIC;
        }
        return searchDepth.trim();
    }
}
