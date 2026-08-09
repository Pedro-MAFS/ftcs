package com.mfs.tokengateway.admin.api.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 时间窗回显（US-G6-06）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminTimeWindow {

    private Instant from;
    private Instant to;

    public AdminTimeWindow() {}

    public AdminTimeWindow(Instant from, Instant to) {
        this.from = from;
        this.to = to;
    }

    @JsonProperty("from")
    public Instant getFrom() {
        return from;
    }

    public void setFrom(Instant from) {
        this.from = from;
    }

    @JsonProperty("to")
    public Instant getTo() {
        return to;
    }

    public void setTo(Instant to) {
        this.to = to;
    }
}
