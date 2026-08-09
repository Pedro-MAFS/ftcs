package com.mfs.tokengateway.admin.utils;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** 厘 ↔ 元（1 元 = 1000 厘）。 */
public final class AdminMoney {

    private static final BigDecimal LI_PER_YUAN = BigDecimal.valueOf(1000L);

    private AdminMoney() {}

    public static BigDecimal liToYuan(long li) {
        return BigDecimal.valueOf(li).divide(LI_PER_YUAN, 3, RoundingMode.HALF_UP);
    }

    public static BigDecimal liToYuan(Long li) {
        if (li == null) {
            return null;
        }
        return liToYuan(li.longValue());
    }
}
