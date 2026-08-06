package com.mfs.tokengateway.server.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 用户面板模型价目（US-G4-05）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BillingPortalPricesResponse {

    private List<BillingPortalPriceItem> items = new ArrayList<>();

    @JsonProperty("as_of")
    private Instant asOf;

    public List<BillingPortalPriceItem> getItems() {
        return items;
    }

    public void setItems(List<BillingPortalPriceItem> items) {
        this.items = items != null ? items : new ArrayList<>();
    }

    public Instant getAsOf() {
        return asOf;
    }

    public void setAsOf(Instant asOf) {
        this.asOf = asOf;
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public static class BillingPortalPriceItem {

        private String model;

        @JsonProperty("input_price_yuan_per_mtok")
        private BigDecimal inputPriceYuanPerMtok;

        @JsonProperty("output_price_yuan_per_mtok")
        private BigDecimal outputPriceYuanPerMtok;

        @JsonProperty("effective_from")
        private Instant effectiveFrom;

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public BigDecimal getInputPriceYuanPerMtok() {
            return inputPriceYuanPerMtok;
        }

        public void setInputPriceYuanPerMtok(BigDecimal inputPriceYuanPerMtok) {
            this.inputPriceYuanPerMtok = inputPriceYuanPerMtok;
        }

        public BigDecimal getOutputPriceYuanPerMtok() {
            return outputPriceYuanPerMtok;
        }

        public void setOutputPriceYuanPerMtok(BigDecimal outputPriceYuanPerMtok) {
            this.outputPriceYuanPerMtok = outputPriceYuanPerMtok;
        }

        public Instant getEffectiveFrom() {
            return effectiveFrom;
        }

        public void setEffectiveFrom(Instant effectiveFrom) {
            this.effectiveFrom = effectiveFrom;
        }
    }
}
