package com.mfs.tokengateway.admin.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.mfs.tokengateway.admin.api.dto.AdminDashboardSeriesResponse;
import com.mfs.tokengateway.admin.api.dto.AdminDashboardSummaryResponse;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.db.dbservice.DashboardDayAgg;
import com.mfs.tokengateway.db.dbservice.LedgerAmountCount;
import com.mfs.tokengateway.db.dbservice.RequestCogsMarginSum;
import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;

@ExtendWith(MockitoExtension.class)
class AdminDashboardApplicationTest {

    /** 2026-08-09 12:00 UTC = 2026-08-09 20:00 Shanghai */
    private static final Instant FIXED = Instant.parse("2026-08-09T12:00:00Z");

    @Mock
    TokenUserDbService tokenUserDbService;

    @Mock
    TokenLedgerEntryDbService ledgerEntryDbService;

    @Mock
    TokenRequestLogDbService requestLogDbService;

    AdminDashboardApplication app;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(FIXED, ZoneOffset.UTC);
        app = new AdminDashboardApplication(
                tokenUserDbService, ledgerEntryDbService, requestLogDbService, clock);
    }

    @Test
    void summaryUsesShanghaiTodayWindowAndTopupNotAdjust() {
        when(tokenUserDbService.count()).thenReturn(100L);
        when(tokenUserDbService.countCreatedBetween(any(), any())).thenReturn(3L);
        when(ledgerEntryDbService.sumAmountByTypeBetween(eq("topup"), any(), any()))
                .thenReturn(new LedgerAmountCount(10000L, 2L));
        when(ledgerEntryDbService.sumAmountByTypeBetween(eq("adjust"), any(), any()))
                .thenReturn(new LedgerAmountCount(-500L, 1L));
        when(ledgerEntryDbService.sumAbsAmountByTypeBetween(eq("charge"), any(), any()))
                .thenReturn(new LedgerAmountCount(2000L, 5L));
        when(requestLogDbService.sumCogsMarginChargedBetween(any(), any()))
                .thenReturn(new RequestCogsMarginSum(800L, 1200L));
        when(requestLogDbService.countDistinctUsersBetween(any(), any())).thenReturn(9L);

        AdminDashboardSummaryResponse resp = app.summary();
        assertEquals("Asia/Shanghai", resp.getTimezone());
        assertEquals(100L, resp.getUsers().getTotal());
        assertEquals(3L, resp.getUsers().getTodayNew());
        assertEquals("10.000", resp.getTopup().getTodayAmountYuan().toPlainString());
        assertEquals(-500L, resp.getTopup().getAdjustTodayAmountLi());
        assertEquals("2.000", resp.getCharge().getTodayAmountYuan().toPlainString());
        assertEquals(800L, resp.getCharge().getTodayCogsLi());
        assertEquals("0.800", resp.getCharge().getTodayCogsYuan().toPlainString());
        assertEquals(1200L, resp.getCharge().getTodayMarginLi());
        assertEquals("1.200", resp.getCharge().getTodayMarginYuan().toPlainString());
        assertEquals(9L, resp.getActive().getDau());

        // 今日窗：2026-08-09 00:00 CST = 2026-08-08 16:00 UTC
        LocalDateTime todayFrom = LocalDateTime.parse("2026-08-08T16:00:00");
        LocalDateTime todayTo = LocalDateTime.parse("2026-08-09T16:00:00");
        verify(tokenUserDbService).countCreatedBetween(eq(todayFrom), eq(todayTo));
        verify(ledgerEntryDbService).sumAmountByTypeBetween(eq("topup"), eq(todayFrom), eq(todayTo));
    }

    @Test
    void seriesFillsMissingDays() {
        DashboardDayAgg one = new DashboardDayAgg();
        one.setDaySh("2026-08-09");
        one.setUsers(4L);
        when(tokenUserDbService.countCreatedGroupedByShanghaiDay(any(), any()))
                .thenReturn(List.of(one));

        AdminDashboardSeriesResponse resp = app.series("user_growth", 7);
        assertEquals(7, resp.getPoints().size());
        assertEquals("2026-08-03", resp.getPoints().get(0).getDay());
        assertEquals(0L, resp.getPoints().get(0).getUsers());
        assertEquals("2026-08-09", resp.getPoints().get(6).getDay());
        assertEquals(4L, resp.getPoints().get(6).getUsers());
        assertNull(resp.getPoints().get(6).getValueLi());
    }

    @Test
    void seriesInvalidMetric() {
        AdminApiException ex =
                assertThrows(AdminApiException.class, () -> app.series("finance", 30));
        assertEquals("validation_error", ex.getCode());
    }

    @Test
    void seriesInvalidDays() {
        AdminApiException ex =
                assertThrows(AdminApiException.class, () -> app.series("dau", 15));
        assertEquals("validation_error", ex.getCode());
    }
}
