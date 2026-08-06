package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class BillingPortalApplicationTest {

    @Test
    void maskUserCodeKeepsPrefixAndSuffix() {
        assertEquals("u_****8a21", BillingPortalApplication.maskUserCode("u_abxx8a21"));
        assertEquals("ab****yz", BillingPortalApplication.maskUserCode("ab12yz"));
        assertEquals("****", BillingPortalApplication.maskUserCode("ab"));
        assertEquals("—", BillingPortalApplication.maskUserCode(""));
    }
}
