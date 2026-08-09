package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mfs.tokengateway.admin.domain.price.PriceBillingUnit;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** POST /admin/v1/prices 请求体（US-G6-10）。 */
public class AdminPriceCreateRequest {

    @NotBlank
    private String model;

    @NotNull
    @JsonProperty("billing_unit")
    private PriceBillingUnit billingUnit;

    @NotNull
    @JsonProperty("effective_from")
    private Instant effectiveFrom;

    @NotBlank
    @Size(max = 128)
    private String operator;

    @NotBlank
    @Size(max = 512)
    private String note;

    @JsonProperty("input_price_li_per_mtok")
    private Long inputPriceLiPerMtok;

    @JsonProperty("output_price_li_per_mtok")
    private Long outputPriceLiPerMtok;

    @JsonProperty("upstream_input_cost_li_per_mtok")
    private Long upstreamInputCostLiPerMtok;

    @JsonProperty("upstream_cache_cost_li_per_mtok")
    private Long upstreamCacheCostLiPerMtok;

    @JsonProperty("upstream_output_cost_li_per_mtok")
    private Long upstreamOutputCostLiPerMtok;

    @JsonProperty("input_price_yuan_per_mtok")
    private BigDecimal inputPriceYuanPerMtok;

    @JsonProperty("output_price_yuan_per_mtok")
    private BigDecimal outputPriceYuanPerMtok;

    @JsonProperty("upstream_input_cost_yuan_per_mtok")
    private BigDecimal upstreamInputCostYuanPerMtok;

    @JsonProperty("upstream_cache_cost_yuan_per_mtok")
    private BigDecimal upstreamCacheCostYuanPerMtok;

    @JsonProperty("upstream_output_cost_yuan_per_mtok")
    private BigDecimal upstreamOutputCostYuanPerMtok;

    @JsonProperty("price_li_per_call")
    private Long priceLiPerCall;

    @JsonProperty("cogs_li_per_call")
    private Long cogsLiPerCall;

    @JsonProperty("price_yuan_per_call")
    private BigDecimal priceYuanPerCall;

    @JsonProperty("cogs_yuan_per_call")
    private BigDecimal cogsYuanPerCall;

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public PriceBillingUnit getBillingUnit() {
        return billingUnit;
    }

    public void setBillingUnit(PriceBillingUnit billingUnit) {
        this.billingUnit = billingUnit;
    }

    public Instant getEffectiveFrom() {
        return effectiveFrom;
    }

    public void setEffectiveFrom(Instant effectiveFrom) {
        this.effectiveFrom = effectiveFrom;
    }

    public String getOperator() {
        return operator;
    }

    public void setOperator(String operator) {
        this.operator = operator;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Long getInputPriceLiPerMtok() {
        return inputPriceLiPerMtok;
    }

    public void setInputPriceLiPerMtok(Long inputPriceLiPerMtok) {
        this.inputPriceLiPerMtok = inputPriceLiPerMtok;
    }

    public Long getOutputPriceLiPerMtok() {
        return outputPriceLiPerMtok;
    }

    public void setOutputPriceLiPerMtok(Long outputPriceLiPerMtok) {
        this.outputPriceLiPerMtok = outputPriceLiPerMtok;
    }

    public Long getUpstreamInputCostLiPerMtok() {
        return upstreamInputCostLiPerMtok;
    }

    public void setUpstreamInputCostLiPerMtok(Long upstreamInputCostLiPerMtok) {
        this.upstreamInputCostLiPerMtok = upstreamInputCostLiPerMtok;
    }

    public Long getUpstreamCacheCostLiPerMtok() {
        return upstreamCacheCostLiPerMtok;
    }

    public void setUpstreamCacheCostLiPerMtok(Long upstreamCacheCostLiPerMtok) {
        this.upstreamCacheCostLiPerMtok = upstreamCacheCostLiPerMtok;
    }

    public Long getUpstreamOutputCostLiPerMtok() {
        return upstreamOutputCostLiPerMtok;
    }

    public void setUpstreamOutputCostLiPerMtok(Long upstreamOutputCostLiPerMtok) {
        this.upstreamOutputCostLiPerMtok = upstreamOutputCostLiPerMtok;
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

    public BigDecimal getUpstreamInputCostYuanPerMtok() {
        return upstreamInputCostYuanPerMtok;
    }

    public void setUpstreamInputCostYuanPerMtok(BigDecimal upstreamInputCostYuanPerMtok) {
        this.upstreamInputCostYuanPerMtok = upstreamInputCostYuanPerMtok;
    }

    public BigDecimal getUpstreamCacheCostYuanPerMtok() {
        return upstreamCacheCostYuanPerMtok;
    }

    public void setUpstreamCacheCostYuanPerMtok(BigDecimal upstreamCacheCostYuanPerMtok) {
        this.upstreamCacheCostYuanPerMtok = upstreamCacheCostYuanPerMtok;
    }

    public BigDecimal getUpstreamOutputCostYuanPerMtok() {
        return upstreamOutputCostYuanPerMtok;
    }

    public void setUpstreamOutputCostYuanPerMtok(BigDecimal upstreamOutputCostYuanPerMtok) {
        this.upstreamOutputCostYuanPerMtok = upstreamOutputCostYuanPerMtok;
    }

    public Long getPriceLiPerCall() {
        return priceLiPerCall;
    }

    public void setPriceLiPerCall(Long priceLiPerCall) {
        this.priceLiPerCall = priceLiPerCall;
    }

    public Long getCogsLiPerCall() {
        return cogsLiPerCall;
    }

    public void setCogsLiPerCall(Long cogsLiPerCall) {
        this.cogsLiPerCall = cogsLiPerCall;
    }

    public BigDecimal getPriceYuanPerCall() {
        return priceYuanPerCall;
    }

    public void setPriceYuanPerCall(BigDecimal priceYuanPerCall) {
        this.priceYuanPerCall = priceYuanPerCall;
    }

    public BigDecimal getCogsYuanPerCall() {
        return cogsYuanPerCall;
    }

    public void setCogsYuanPerCall(BigDecimal cogsYuanPerCall) {
        this.cogsYuanPerCall = cogsYuanPerCall;
    }
}
