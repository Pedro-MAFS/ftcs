package com.mfs.tokengateway.admin.domain.price;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import com.mfs.tokengateway.admin.api.dto.AdminPriceCreateRequest;
import com.mfs.tokengateway.db.po.TokenPriceRule;

/**
 * 价目入参编码与护栏（US-G6-10）。
 * <p>
 * Chat：厘/MTok；{@code tavily.search}：厘/次 × 1e6 写入 input 列（方案 A）。
 */
public final class PriceEncoding {

    public static final String TAVILY_SEARCH = "tavily.search";

    /** 单档 Chat 上限：1 万元 / MTok = 10_000_000 厘/MTok。 */
    public static final long MAX_LI_PER_MTOK = 10_000_000L;

    /** 按次上限：100 元/次 = 100_000 厘/次。 */
    public static final long MAX_LI_PER_CALL = 100_000L;

    public static final long PER_CALL_SCALE = 1_000_000L;

    private static final BigDecimal LI_PER_YUAN = BigDecimal.valueOf(1000L);

    private PriceEncoding() {}

    public static boolean isPerCallModel(String model) {
        return TAVILY_SEARCH.equals(model);
    }

    public static PriceBillingUnit billingUnitForModel(String model) {
        return isPerCallModel(model) ? PriceBillingUnit.PER_CALL : PriceBillingUnit.PER_MTOK;
    }

    public static TokenPriceRule toRow(AdminPriceCreateRequest req) {
        if (req.getModel() == null || req.getModel().isBlank()) {
            throw AdminPriceException.badRequest("validation_error", "model is required");
        }
        String model = req.getModel().trim();
        PriceBillingUnit unit = req.getBillingUnit();
        if (unit == null) {
            throw AdminPriceException.badRequest("validation_error", "billing_unit is required");
        }
        if (isPerCallModel(model) && unit != PriceBillingUnit.PER_CALL) {
            throw AdminPriceException.badRequest(
                    "billing_unit_mismatch",
                    "tavily.search requires billing_unit=per_call");
        }
        if (!isPerCallModel(model) && unit != PriceBillingUnit.PER_MTOK) {
            throw AdminPriceException.badRequest(
                    "billing_unit_mismatch",
                    "chat models require billing_unit=per_mtok");
        }
        if (req.getEffectiveFrom() == null) {
            throw AdminPriceException.badRequest("validation_error", "effective_from is required");
        }

        TokenPriceRule row = new TokenPriceRule();
        row.setModel(model);
        row.setEffectiveFrom(toUtcLocalDateTime(req.getEffectiveFrom()));
        row.setCreatedAt(LocalDateTime.now(ZoneOffset.UTC));

        if (unit == PriceBillingUnit.PER_CALL) {
            encodePerCall(req, row);
        } else {
            encodePerMtok(req, row);
        }
        return row;
    }

    private static void encodePerMtok(AdminPriceCreateRequest req, TokenPriceRule row) {
        long input = resolveLi(
                req.getInputPriceLiPerMtok(),
                req.getInputPriceYuanPerMtok(),
                "input_price");
        long output = resolveLi(
                req.getOutputPriceLiPerMtok(),
                req.getOutputPriceYuanPerMtok(),
                "output_price");
        long upIn = resolveLi(
                req.getUpstreamInputCostLiPerMtok(),
                req.getUpstreamInputCostYuanPerMtok(),
                "upstream_input_cost");
        long upCache = resolveLi(
                req.getUpstreamCacheCostLiPerMtok(),
                req.getUpstreamCacheCostYuanPerMtok(),
                "upstream_cache_cost");
        long upOut = resolveLi(
                req.getUpstreamOutputCostLiPerMtok(),
                req.getUpstreamOutputCostYuanPerMtok(),
                "upstream_output_cost");
        guardMtok(input, "input_price");
        guardMtok(output, "output_price");
        guardMtok(upIn, "upstream_input_cost");
        guardMtok(upCache, "upstream_cache_cost");
        guardMtok(upOut, "upstream_output_cost");
        row.setInputPriceLiPerMTok(input);
        row.setOutputPriceLiPerMTok(output);
        row.setUpstreamInputCostLiPerMTok(upIn);
        row.setUpstreamCacheCostLiPerMTok(upCache);
        row.setUpstreamOutputCostLiPerMTok(upOut);
    }

    private static void encodePerCall(AdminPriceCreateRequest req, TokenPriceRule row) {
        long priceLi = resolveLi(req.getPriceLiPerCall(), req.getPriceYuanPerCall(), "price");
        long cogsLi = resolveLi(req.getCogsLiPerCall(), req.getCogsYuanPerCall(), "cogs");
        guardCall(priceLi, "price");
        guardCall(cogsLi, "cogs");
        row.setInputPriceLiPerMTok(priceLi * PER_CALL_SCALE);
        row.setOutputPriceLiPerMTok(0L);
        row.setUpstreamInputCostLiPerMTok(cogsLi * PER_CALL_SCALE);
        row.setUpstreamCacheCostLiPerMTok(0L);
        row.setUpstreamOutputCostLiPerMTok(0L);
    }

    static long resolveLi(Long li, BigDecimal yuan, String field) {
        if (li != null && yuan != null) {
            long fromYuan = yuanToLi(yuan);
            if (fromYuan != li) {
                throw AdminPriceException.badRequest(
                        "validation_error",
                        field + " li and yuan conflict");
            }
            return li;
        }
        if (li != null) {
            return li;
        }
        if (yuan != null) {
            return yuanToLi(yuan);
        }
        throw AdminPriceException.badRequest("validation_error", field + " is required");
    }

    public static long yuanToLi(BigDecimal yuan) {
        if (yuan.compareTo(BigDecimal.ZERO) < 0) {
            throw AdminPriceException.badRequest("validation_error", "yuan must be >= 0");
        }
        return yuan.multiply(LI_PER_YUAN).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    public static BigDecimal liToYuan(long li) {
        return BigDecimal.valueOf(li).divide(LI_PER_YUAN, 3, RoundingMode.HALF_UP);
    }

    /** 方案 A：库内 input → 厘/次。 */
    public static long storedToLiPerCall(long inputPriceLiPerMTok) {
        return inputPriceLiPerMTok / PER_CALL_SCALE;
    }

    public static BigDecimal storedToYuanPerCall(long inputPriceLiPerMTok) {
        return liToYuan(storedToLiPerCall(inputPriceLiPerMTok));
    }

    public static LocalDateTime toUtcLocalDateTime(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    public static Instant toInstant(LocalDateTime utc) {
        if (utc == null) {
            return null;
        }
        return utc.toInstant(ZoneOffset.UTC);
    }

    private static void guardMtok(long li, String field) {
        if (li < 0 || li > MAX_LI_PER_MTOK) {
            throw AdminPriceException.badRequest(
                    "price_out_of_range",
                    field + " li/MTok out of range [0, " + MAX_LI_PER_MTOK + "]");
        }
    }

    private static void guardCall(long li, String field) {
        if (li < 0 || li > MAX_LI_PER_CALL) {
            throw AdminPriceException.badRequest(
                    "price_out_of_range",
                    field + " li/call out of range [0, " + MAX_LI_PER_CALL + "]");
        }
    }
}
