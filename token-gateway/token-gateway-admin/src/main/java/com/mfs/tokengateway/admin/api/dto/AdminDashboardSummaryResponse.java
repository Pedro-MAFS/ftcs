package com.mfs.tokengateway.admin.api.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /admin/v1/dashboard/summary（US-G6-02）。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminDashboardSummaryResponse {

    private String timezone;

    @JsonProperty("as_of")
    private Instant asOf;

    private Windows windows;
    private Users users;
    private MoneyBlock topup;
    private MoneyBlock charge;
    private Active active;

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }

    public Instant getAsOf() {
        return asOf;
    }

    public void setAsOf(Instant asOf) {
        this.asOf = asOf;
    }

    public Windows getWindows() {
        return windows;
    }

    public void setWindows(Windows windows) {
        this.windows = windows;
    }

    public Users getUsers() {
        return users;
    }

    public void setUsers(Users users) {
        this.users = users;
    }

    public MoneyBlock getTopup() {
        return topup;
    }

    public void setTopup(MoneyBlock topup) {
        this.topup = topup;
    }

    public MoneyBlock getCharge() {
        return charge;
    }

    public void setCharge(MoneyBlock charge) {
        this.charge = charge;
    }

    public Active getActive() {
        return active;
    }

    public void setActive(Active active) {
        this.active = active;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Windows {
        private AdminTimeWindow today;
        private AdminTimeWindow d7;
        private AdminTimeWindow d30;

        public AdminTimeWindow getToday() {
            return today;
        }

        public void setToday(AdminTimeWindow today) {
            this.today = today;
        }

        public AdminTimeWindow getD7() {
            return d7;
        }

        public void setD7(AdminTimeWindow d7) {
            this.d7 = d7;
        }

        public AdminTimeWindow getD30() {
            return d30;
        }

        public void setD30(AdminTimeWindow d30) {
            this.d30 = d30;
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Users {
        private long total;

        @JsonProperty("today_new")
        private long todayNew;

        @JsonProperty("yesterday_new")
        private long yesterdayNew;

        @JsonProperty("d7_new")
        private long d7New;

        @JsonProperty("d30_new")
        private long d30New;

        public long getTotal() {
            return total;
        }

        public void setTotal(long total) {
            this.total = total;
        }

        public long getTodayNew() {
            return todayNew;
        }

        public void setTodayNew(long todayNew) {
            this.todayNew = todayNew;
        }

        public long getYesterdayNew() {
            return yesterdayNew;
        }

        public void setYesterdayNew(long yesterdayNew) {
            this.yesterdayNew = yesterdayNew;
        }

        public long getD7New() {
            return d7New;
        }

        public void setD7New(long d7New) {
            this.d7New = d7New;
        }

        public long getD30New() {
            return d30New;
        }

        public void setD30New(long d30New) {
            this.d30New = d30New;
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MoneyBlock {
        @JsonProperty("today_amount_li")
        private long todayAmountLi;

        @JsonProperty("today_amount_yuan")
        private BigDecimal todayAmountYuan;

        @JsonProperty("today_count")
        private long todayCount;

        @JsonProperty("d7_amount_li")
        private long d7AmountLi;

        @JsonProperty("d7_amount_yuan")
        private BigDecimal d7AmountYuan;

        @JsonProperty("d7_count")
        private long d7Count;

        @JsonProperty("d30_amount_li")
        private long d30AmountLi;

        @JsonProperty("d30_amount_yuan")
        private BigDecimal d30AmountYuan;

        @JsonProperty("d30_count")
        private long d30Count;

        @JsonProperty("adjust_today_amount_li")
        private Long adjustTodayAmountLi;

        @JsonProperty("adjust_today_amount_yuan")
        private BigDecimal adjustTodayAmountYuan;

        /** 今日已结算请求成本（仅 charge 卡使用）。 */
        @JsonProperty("today_cogs_li")
        private Long todayCogsLi;

        @JsonProperty("today_cogs_yuan")
        private BigDecimal todayCogsYuan;

        /** 今日已结算请求毛利（仅 charge 卡使用）。 */
        @JsonProperty("today_margin_li")
        private Long todayMarginLi;

        @JsonProperty("today_margin_yuan")
        private BigDecimal todayMarginYuan;

        public long getTodayAmountLi() {
            return todayAmountLi;
        }

        public void setTodayAmountLi(long todayAmountLi) {
            this.todayAmountLi = todayAmountLi;
        }

        public BigDecimal getTodayAmountYuan() {
            return todayAmountYuan;
        }

        public void setTodayAmountYuan(BigDecimal todayAmountYuan) {
            this.todayAmountYuan = todayAmountYuan;
        }

        public long getTodayCount() {
            return todayCount;
        }

        public void setTodayCount(long todayCount) {
            this.todayCount = todayCount;
        }

        public long getD7AmountLi() {
            return d7AmountLi;
        }

        public void setD7AmountLi(long d7AmountLi) {
            this.d7AmountLi = d7AmountLi;
        }

        public BigDecimal getD7AmountYuan() {
            return d7AmountYuan;
        }

        public void setD7AmountYuan(BigDecimal d7AmountYuan) {
            this.d7AmountYuan = d7AmountYuan;
        }

        public long getD7Count() {
            return d7Count;
        }

        public void setD7Count(long d7Count) {
            this.d7Count = d7Count;
        }

        public long getD30AmountLi() {
            return d30AmountLi;
        }

        public void setD30AmountLi(long d30AmountLi) {
            this.d30AmountLi = d30AmountLi;
        }

        public BigDecimal getD30AmountYuan() {
            return d30AmountYuan;
        }

        public void setD30AmountYuan(BigDecimal d30AmountYuan) {
            this.d30AmountYuan = d30AmountYuan;
        }

        public long getD30Count() {
            return d30Count;
        }

        public void setD30Count(long d30Count) {
            this.d30Count = d30Count;
        }

        public Long getAdjustTodayAmountLi() {
            return adjustTodayAmountLi;
        }

        public void setAdjustTodayAmountLi(Long adjustTodayAmountLi) {
            this.adjustTodayAmountLi = adjustTodayAmountLi;
        }

        public BigDecimal getAdjustTodayAmountYuan() {
            return adjustTodayAmountYuan;
        }

        public void setAdjustTodayAmountYuan(BigDecimal adjustTodayAmountYuan) {
            this.adjustTodayAmountYuan = adjustTodayAmountYuan;
        }

        public Long getTodayCogsLi() {
            return todayCogsLi;
        }

        public void setTodayCogsLi(Long todayCogsLi) {
            this.todayCogsLi = todayCogsLi;
        }

        public BigDecimal getTodayCogsYuan() {
            return todayCogsYuan;
        }

        public void setTodayCogsYuan(BigDecimal todayCogsYuan) {
            this.todayCogsYuan = todayCogsYuan;
        }

        public Long getTodayMarginLi() {
            return todayMarginLi;
        }

        public void setTodayMarginLi(Long todayMarginLi) {
            this.todayMarginLi = todayMarginLi;
        }

        public BigDecimal getTodayMarginYuan() {
            return todayMarginYuan;
        }

        public void setTodayMarginYuan(BigDecimal todayMarginYuan) {
            this.todayMarginYuan = todayMarginYuan;
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Active {
        private long dau;
        private long wau;

        @JsonProperty("wau_ratio")
        private BigDecimal wauRatio;

        public long getDau() {
            return dau;
        }

        public void setDau(long dau) {
            this.dau = dau;
        }

        public long getWau() {
            return wau;
        }

        public void setWau(long wau) {
            this.wau = wau;
        }

        public BigDecimal getWauRatio() {
            return wauRatio;
        }

        public void setWauRatio(BigDecimal wauRatio) {
            this.wauRatio = wauRatio;
        }
    }
}
