package com.mfs.tokengateway.admin.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.mfs.tokengateway.admin.api.dto.AdminDashboardSeriesResponse;
import com.mfs.tokengateway.admin.api.dto.AdminDashboardSeriesResponse.Point;
import com.mfs.tokengateway.admin.api.dto.AdminDashboardSummaryResponse;
import com.mfs.tokengateway.admin.api.dto.AdminDashboardSummaryResponse.Active;
import com.mfs.tokengateway.admin.api.dto.AdminDashboardSummaryResponse.MoneyBlock;
import com.mfs.tokengateway.admin.api.dto.AdminDashboardSummaryResponse.Users;
import com.mfs.tokengateway.admin.api.dto.AdminDashboardSummaryResponse.Windows;
import com.mfs.tokengateway.admin.api.dto.AdminTimeWindow;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.admin.utils.AdminMoney;
import com.mfs.tokengateway.db.dbservice.DashboardDayAgg;
import com.mfs.tokengateway.db.dbservice.LedgerAmountCount;
import com.mfs.tokengateway.db.dbservice.RequestCogsMarginSum;
import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;

/** 运营大屏聚合（US-G6-02/03）。 */
@Service
public class AdminDashboardApplication {

    public static final String TIMEZONE = "Asia/Shanghai";
    public static final ZoneId ZONE_SH = ZoneId.of(TIMEZONE);

    public static final String METRIC_USER_GROWTH = "user_growth";
    public static final String METRIC_TOPUP = "topup";
    public static final String METRIC_CHARGE = "charge";
    public static final String METRIC_DAU = "dau";

    private static final Set<String> METRICS =
            Set.of(METRIC_USER_GROWTH, METRIC_TOPUP, METRIC_CHARGE, METRIC_DAU);
    private static final Set<Integer> ALLOWED_DAYS = Set.of(7, 30);

    private final TokenUserDbService tokenUserDbService;
    private final TokenLedgerEntryDbService ledgerEntryDbService;
    private final TokenRequestLogDbService requestLogDbService;
    private final Clock clock;

    public AdminDashboardApplication(
            TokenUserDbService tokenUserDbService,
            TokenLedgerEntryDbService ledgerEntryDbService,
            TokenRequestLogDbService requestLogDbService,
            Clock clock) {
        this.tokenUserDbService = tokenUserDbService;
        this.ledgerEntryDbService = ledgerEntryDbService;
        this.requestLogDbService = requestLogDbService;
        this.clock = clock;
    }

    public AdminDashboardSummaryResponse summary() {
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, ZONE_SH);
        DayWindow todayW = dayWindow(today);
        DayWindow yesterdayW = dayWindow(today.minusDays(1));
        DayWindow d7W = rangeWindow(today.minusDays(6), today.plusDays(1));
        DayWindow d30W = rangeWindow(today.minusDays(29), today.plusDays(1));

        AdminDashboardSummaryResponse resp = new AdminDashboardSummaryResponse();
        resp.setTimezone(TIMEZONE);
        resp.setAsOf(now);

        Windows windows = new Windows();
        windows.setToday(toDto(todayW));
        windows.setD7(toDto(d7W));
        windows.setD30(toDto(d30W));
        resp.setWindows(windows);

        Users users = new Users();
        users.setTotal(tokenUserDbService.count());
        users.setTodayNew(tokenUserDbService.countCreatedBetween(todayW.fromLdt(), todayW.toLdt()));
        users.setYesterdayNew(
                tokenUserDbService.countCreatedBetween(yesterdayW.fromLdt(), yesterdayW.toLdt()));
        users.setD7New(tokenUserDbService.countCreatedBetween(d7W.fromLdt(), d7W.toLdt()));
        users.setD30New(tokenUserDbService.countCreatedBetween(d30W.fromLdt(), d30W.toLdt()));
        resp.setUsers(users);

        MoneyBlock topup = moneyBlock(
                TokenLedgerEntryDbService.TYPE_TOPUP, false, todayW, d7W, d30W);
        LedgerAmountCount adjustToday = ledgerEntryDbService.sumAmountByTypeBetween(
                TokenLedgerEntryDbService.TYPE_ADJUST, todayW.fromLdt(), todayW.toLdt());
        topup.setAdjustTodayAmountLi(adjustToday.getAmountLi());
        topup.setAdjustTodayAmountYuan(AdminMoney.liToYuan(adjustToday.getAmountLi()));
        resp.setTopup(topup);

        MoneyBlock charge = moneyBlock(TokenLedgerEntryDbService.TYPE_CHARGE, true, todayW, d7W, d30W);
        RequestCogsMarginSum cogsMargin =
                requestLogDbService.sumCogsMarginChargedBetween(todayW.fromLdt(), todayW.toLdt());
        charge.setTodayCogsLi(cogsMargin.getCogsLi());
        charge.setTodayCogsYuan(AdminMoney.liToYuan(cogsMargin.getCogsLi()));
        charge.setTodayMarginLi(cogsMargin.getMarginLi());
        charge.setTodayMarginYuan(AdminMoney.liToYuan(cogsMargin.getMarginLi()));
        resp.setCharge(charge);

        Active active = new Active();
        long dau = requestLogDbService.countDistinctUsersBetween(todayW.fromLdt(), todayW.toLdt());
        long wau = requestLogDbService.countDistinctUsersBetween(d7W.fromLdt(), d7W.toLdt());
        active.setDau(dau);
        active.setWau(wau);
        if (users.getTotal() > 0) {
            active.setWauRatio(BigDecimal.valueOf(wau)
                    .divide(BigDecimal.valueOf(users.getTotal()), 3, RoundingMode.HALF_UP));
        }
        resp.setActive(active);
        return resp;
    }

    public AdminDashboardSeriesResponse series(String metricRaw, Integer daysRaw) {
        String metric = normalizeMetric(metricRaw);
        int days = normalizeDays(daysRaw);
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, ZONE_SH);
        LocalDate startDay = today.minusDays(days - 1L);
        DayWindow window = rangeWindow(startDay, today.plusDays(1));

        Map<String, DashboardDayAgg> byDay = loadSeriesMap(metric, window);

        List<Point> points = new ArrayList<>(days);
        for (int i = 0; i < days; i++) {
            LocalDate day = startDay.plusDays(i);
            String key = day.toString();
            DashboardDayAgg agg = byDay.get(key);
            Point p = new Point();
            p.setDay(key);
            if (METRIC_USER_GROWTH.equals(metric) || METRIC_DAU.equals(metric)) {
                long u = agg != null && agg.getUsers() != null ? agg.getUsers() : 0L;
                p.setUsers(u);
            } else {
                long amount = agg != null && agg.getAmountLi() != null ? agg.getAmountLi() : 0L;
                long count = agg != null && agg.getCnt() != null ? agg.getCnt() : 0L;
                p.setValueLi(amount);
                p.setValueYuan(AdminMoney.liToYuan(amount));
                p.setCount(count);
            }
            points.add(p);
        }

        AdminDashboardSeriesResponse resp = new AdminDashboardSeriesResponse();
        resp.setTimezone(TIMEZONE);
        resp.setMetric(metric);
        resp.setDays(days);
        resp.setFrom(window.from());
        resp.setTo(window.to());
        resp.setPoints(points);
        return resp;
    }

    private Map<String, DashboardDayAgg> loadSeriesMap(String metric, DayWindow window) {
        List<DashboardDayAgg> rows;
        if (METRIC_USER_GROWTH.equals(metric)) {
            rows = tokenUserDbService.countCreatedGroupedByShanghaiDay(
                    window.fromLdt(), window.toLdt());
        } else if (METRIC_TOPUP.equals(metric)) {
            rows = ledgerEntryDbService.sumAmountGroupedByShanghaiDay(
                    TokenLedgerEntryDbService.TYPE_TOPUP, window.fromLdt(), window.toLdt());
        } else if (METRIC_CHARGE.equals(metric)) {
            rows = ledgerEntryDbService.sumAbsAmountGroupedByShanghaiDay(
                    TokenLedgerEntryDbService.TYPE_CHARGE, window.fromLdt(), window.toLdt());
        } else {
            rows = requestLogDbService.countDistinctUsersGroupedByShanghaiDay(
                    window.fromLdt(), window.toLdt());
        }
        Map<String, DashboardDayAgg> map = new HashMap<>();
        for (DashboardDayAgg row : rows) {
            if (row != null && StringUtils.hasText(row.getDaySh())) {
                map.put(row.getDaySh().trim(), row);
            }
        }
        return map;
    }

    private MoneyBlock moneyBlock(
            String type, boolean abs, DayWindow today, DayWindow d7, DayWindow d30) {
        LedgerAmountCount t = abs
                ? ledgerEntryDbService.sumAbsAmountByTypeBetween(type, today.fromLdt(), today.toLdt())
                : ledgerEntryDbService.sumAmountByTypeBetween(type, today.fromLdt(), today.toLdt());
        LedgerAmountCount w7 = abs
                ? ledgerEntryDbService.sumAbsAmountByTypeBetween(type, d7.fromLdt(), d7.toLdt())
                : ledgerEntryDbService.sumAmountByTypeBetween(type, d7.fromLdt(), d7.toLdt());
        LedgerAmountCount w30 = abs
                ? ledgerEntryDbService.sumAbsAmountByTypeBetween(type, d30.fromLdt(), d30.toLdt())
                : ledgerEntryDbService.sumAmountByTypeBetween(type, d30.fromLdt(), d30.toLdt());

        MoneyBlock b = new MoneyBlock();
        b.setTodayAmountLi(t.getAmountLi());
        b.setTodayAmountYuan(AdminMoney.liToYuan(t.getAmountLi()));
        b.setTodayCount(t.getCount());
        b.setD7AmountLi(w7.getAmountLi());
        b.setD7AmountYuan(AdminMoney.liToYuan(w7.getAmountLi()));
        b.setD7Count(w7.getCount());
        b.setD30AmountLi(w30.getAmountLi());
        b.setD30AmountYuan(AdminMoney.liToYuan(w30.getAmountLi()));
        b.setD30Count(w30.getCount());
        return b;
    }

    static String normalizeMetric(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw AdminApiException.badRequest("validation_error", "metric is required");
        }
        String m = raw.trim().toLowerCase(Locale.ROOT);
        if (!METRICS.contains(m)) {
            throw AdminApiException.badRequest(
                    "validation_error",
                    "metric must be user_growth, topup, charge, or dau");
        }
        return m;
    }

    static int normalizeDays(Integer daysRaw) {
        if (daysRaw == null) {
            return 30;
        }
        if (!ALLOWED_DAYS.contains(daysRaw)) {
            throw AdminApiException.badRequest("validation_error", "days must be 7 or 30");
        }
        return daysRaw;
    }

    static DayWindow dayWindow(LocalDate day) {
        Instant from = day.atStartOfDay(ZONE_SH).toInstant();
        Instant to = day.plusDays(1).atStartOfDay(ZONE_SH).toInstant();
        return new DayWindow(from, to);
    }

    static DayWindow rangeWindow(LocalDate startInclusive, LocalDate endExclusive) {
        Instant from = startInclusive.atStartOfDay(ZONE_SH).toInstant();
        Instant to = endExclusive.atStartOfDay(ZONE_SH).toInstant();
        return new DayWindow(from, to);
    }

    private static AdminTimeWindow toDto(DayWindow w) {
        return new AdminTimeWindow(w.from(), w.to());
    }

    record DayWindow(Instant from, Instant to) {
        LocalDateTime fromLdt() {
            return LocalDateTime.ofInstant(from, ZoneOffset.UTC);
        }

        LocalDateTime toLdt() {
            return LocalDateTime.ofInstant(to, ZoneOffset.UTC);
        }
    }
}
