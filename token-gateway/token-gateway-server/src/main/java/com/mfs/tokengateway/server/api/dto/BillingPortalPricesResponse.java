package com.mfs.tokengateway.server.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 用户面板价目（US-G4-05 / US-G5-04：模型 per_mtok + 搜索 per_call）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BillingPortalPricesResponse {

    public static final String BILLING_UNIT_PER_MTOK = "per_mtok";
    public static final String BILLING_UNIT_PER_CALL = "per_call";

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

    /** 按次项省略 mtok 两档；模型项省略 price_yuan_per_call。 */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class BillingPortalPriceItem {

        private String model;

        @JsonProperty("billing_unit")
        private String billingUnit;

        @JsonProperty("input_price_yuan_per_mtok")
        private BigDecimal inputPriceYuanPerMtok;

        @JsonProperty("output_price_yuan_per_mtok")
        private BigDecimal outputPriceYuanPerMtok;

        @JsonProperty("price_yuan_per_call")
        private BigDecimal priceYuanPerCall;

        /**
         * 营销划线原价（元/次）：仅当用户价严格低于上游成本价时回传；
         * 语义为「市场/上游参考价」，不回传 {@code upstream_*} 字段名。
         */
        @JsonProperty("list_price_yuan_per_call")
        private BigDecimal listPriceYuanPerCall;

        /**
         * 营销划线原价（元/百万 Token·输入）：仅当用户输入价严格低于上游输入成本时回传。
         */
        @JsonProperty("list_input_price_yuan_per_mtok")
        private BigDecimal listInputPriceYuanPerMtok;

        /**
         * 营销划线原价（元/百万 Token·输出）：仅当用户输出价严格低于上游输出成本时回传。
         */
        @JsonProperty("list_output_price_yuan_per_mtok")
        private BigDecimal listOutputPriceYuanPerMtok;

        @JsonProperty("effective_from")
        private Instant effectiveFrom;

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public String getBillingUnit() {
            return billingUnit;
        }

        public void setBillingUnit(String billingUnit) {
            this.billingUnit = billingUnit;
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

        public BigDecimal getPriceYuanPerCall() {
            return priceYuanPerCall;
        }

        public void setPriceYuanPerCall(BigDecimal priceYuanPerCall) {
            this.priceYuanPerCall = priceYuanPerCall;
        }

        public BigDecimal getListPriceYuanPerCall() {
            return listPriceYuanPerCall;
        }

        public void setListPriceYuanPerCall(BigDecimal listPriceYuanPerCall) {
            this.listPriceYuanPerCall = listPriceYuanPerCall;
        }

        public BigDecimal getListInputPriceYuanPerMtok() {
            return listInputPriceYuanPerMtok;
        }

        public void setListInputPriceYuanPerMtok(BigDecimal listInputPriceYuanPerMtok) {
            this.listInputPriceYuanPerMtok = listInputPriceYuanPerMtok;
        }

        public BigDecimal getListOutputPriceYuanPerMtok() {
            return listOutputPriceYuanPerMtok;
        }

        public void setListOutputPriceYuanPerMtok(BigDecimal listOutputPriceYuanPerMtok) {
            this.listOutputPriceYuanPerMtok = listOutputPriceYuanPerMtok;
        }

        public Instant getEffectiveFrom() {
            return effectiveFrom;
        }

        public void setEffectiveFrom(Instant effectiveFrom) {
            this.effectiveFrom = effectiveFrom;
        }
    }
}
