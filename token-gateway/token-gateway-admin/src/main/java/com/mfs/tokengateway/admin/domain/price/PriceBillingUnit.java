package com.mfs.tokengateway.admin.domain.price;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** 价目计费单位（US-G6-10）。 */
public enum PriceBillingUnit {
    PER_MTOK("per_mtok"),
    PER_CALL("per_call");

    private final String wire;

    PriceBillingUnit(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static PriceBillingUnit fromWire(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        for (PriceBillingUnit u : values()) {
            if (u.wire.equalsIgnoreCase(raw.trim())) {
                return u;
            }
        }
        throw new IllegalArgumentException("unknown billing_unit: " + raw);
    }
}
