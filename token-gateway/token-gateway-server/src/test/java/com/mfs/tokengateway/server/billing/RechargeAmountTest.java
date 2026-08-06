package com.mfs.tokengateway.server.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class RechargeAmountTest {

    @Test
    void parsesFiftyYuan() {
        RechargeAmount a = RechargeAmount.parse(new BigDecimal("50.00"));
        assertEquals(5000, a.getFen());
        assertEquals(50_000L, a.getLi());
        assertEquals("50.00", a.yuanPlain());
    }

    @Test
    void parsesBounds() {
        assertEquals(100, RechargeAmount.parse("1").getFen());
        assertEquals(10_000, RechargeAmount.parse(100).getFen());
    }

    @Test
    void rejectsInvalid() {
        assertThrows(ResponseStatusException.class, () -> RechargeAmount.parse("0.5"));
        assertThrows(ResponseStatusException.class, () -> RechargeAmount.parse("101"));
        assertThrows(ResponseStatusException.class, () -> RechargeAmount.parse("1.001"));
        assertThrows(ResponseStatusException.class, () -> RechargeAmount.parse(null));
        assertThrows(ResponseStatusException.class, () -> RechargeAmount.parse("abc"));
    }
}
