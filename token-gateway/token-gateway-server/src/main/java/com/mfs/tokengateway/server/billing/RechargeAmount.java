package com.mfs.tokengateway.server.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * 充值金额：元 → 分 / 厘（US-G3-01 §3）。
 * <p>
 * {@code fen = roundHalfUp(yuan * 100)}；{@code li = fen * 10}；合法区间 1.00～100.00 元。
 */
public final class RechargeAmount {

    public static final String REASON_INVALID = "invalid_amount";

    private static final BigDecimal MIN_YUAN = new BigDecimal("1.00");
    private static final BigDecimal MAX_YUAN = new BigDecimal("100.00");
    private static final int MIN_FEN = 100;
    private static final int MAX_FEN = 10_000;

    private final BigDecimal yuan;
    private final int fen;
    private final long li;

    private RechargeAmount(BigDecimal yuan, int fen, long li) {
        this.yuan = yuan;
        this.fen = fen;
        this.li = li;
    }

    public BigDecimal getYuan() {
        return yuan;
    }

    public int getFen() {
        return fen;
    }

    public long getLi() {
        return li;
    }

    /** 固定两位小数字符串，如 {@code 50.00}。 */
    public String yuanPlain() {
        return yuan.setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }

    /**
     * @param raw 请求体中的金额（{@link BigDecimal} / {@link Number} / 数字字符串）
     * @throws ResponseStatusException 400 {@code invalid_amount}
     */
    public static RechargeAmount parse(Object raw) {
        if (raw == null) {
            throw invalid();
        }
        BigDecimal yuan;
        try {
            if (raw instanceof BigDecimal bd) {
                yuan = bd;
            } else if (raw instanceof Number n) {
                yuan = new BigDecimal(n.toString());
            } else if (raw instanceof String s) {
                String t = s.trim();
                if (t.isEmpty()) {
                    throw invalid();
                }
                yuan = new BigDecimal(t);
            } else {
                throw invalid();
            }
        } catch (NumberFormatException e) {
            throw invalid();
        }

        if (yuan.scale() > 2) {
            throw invalid();
        }
        if (yuan.compareTo(MIN_YUAN) < 0 || yuan.compareTo(MAX_YUAN) > 0) {
            throw invalid();
        }

        int fen = yuan.movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValueExact();
        if (fen < MIN_FEN || fen > MAX_FEN) {
            throw invalid();
        }
        long li = (long) fen * 10L;
        BigDecimal normalized = BigDecimal.valueOf(fen, 2);
        return new RechargeAmount(normalized, fen, li);
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, REASON_INVALID);
    }
}
