package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/dashboard/series（US-G6-02）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminDashboardSeriesResponse {

    private String timezone;
    private String metric;
    private int days;
    private Instant from;
    private Instant to;
    private List<Point> points = new ArrayList<>();

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }

    public String getMetric() {
        return metric;
    }

    public void setMetric(String metric) {
        this.metric = metric;
    }

    public int getDays() {
        return days;
    }

    public void setDays(int days) {
        this.days = days;
    }

    public Instant getFrom() {
        return from;
    }

    public void setFrom(Instant from) {
        this.from = from;
    }

    public Instant getTo() {
        return to;
    }

    public void setTo(Instant to) {
        this.to = to;
    }

    public List<Point> getPoints() {
        return points;
    }

    public void setPoints(List<Point> points) {
        this.points = points != null ? points : new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Point {
        private String day;

        @JsonProperty("value_li")
        private Long valueLi;

        @JsonProperty("value_yuan")
        private BigDecimal valueYuan;

        private Long count;
        private Long users;

        public String getDay() {
            return day;
        }

        public void setDay(String day) {
            this.day = day;
        }

        public Long getValueLi() {
            return valueLi;
        }

        public void setValueLi(Long valueLi) {
            this.valueLi = valueLi;
        }

        public BigDecimal getValueYuan() {
            return valueYuan;
        }

        public void setValueYuan(BigDecimal valueYuan) {
            this.valueYuan = valueYuan;
        }

        public Long getCount() {
            return count;
        }

        public void setCount(Long count) {
            this.count = count;
        }

        public Long getUsers() {
            return users;
        }

        public void setUsers(Long users) {
            this.users = users;
        }
    }
}
