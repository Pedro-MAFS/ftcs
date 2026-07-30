package com.mfs.tokengateway.server.pricing;

/** 无生效价目（短码 {@code price_rule_not_found}）。 */
public class PriceRuleNotFoundException extends RuntimeException {

    public static final String CODE = "price_rule_not_found";

    private final String model;

    public PriceRuleNotFoundException(String model) {
        super(CODE + ": model=" + model);
        this.model = model;
    }

    public String getModel() {
        return model;
    }

    public String getCode() {
        return CODE;
    }
}
