package com.mfs.tokengateway.db.mapper;

import java.time.LocalDateTime;
import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mfs.tokengateway.db.dbservice.DashboardDayAgg;
import com.mfs.tokengateway.db.dbservice.LedgerAmountCount;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;

@Mapper
public interface TokenLedgerEntryMapper extends BaseMapper<TokenLedgerEntry> {

    @Select("""
            SELECT COALESCE(SUM(amount_li), 0) AS amount_li, COUNT(*) AS count
            FROM token_ledger_entries
            WHERE type = #{type}
              AND created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            """)
    LedgerAmountCount sumAmountByTypeBetween(
            @Param("type") String type,
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);

    @Select("""
            SELECT COALESCE(SUM(ABS(amount_li)), 0) AS amount_li, COUNT(*) AS count
            FROM token_ledger_entries
            WHERE type = #{type}
              AND created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            """)
    LedgerAmountCount sumAbsAmountByTypeBetween(
            @Param("type") String type,
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);

    @Select("""
            SELECT DATE_FORMAT(created_at + INTERVAL 8 HOUR, '%Y-%m-%d') AS day_sh,
                   COALESCE(SUM(amount_li), 0) AS amount_li,
                   COUNT(*) AS cnt
            FROM token_ledger_entries
            WHERE type = #{type}
              AND created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            GROUP BY DATE_FORMAT(created_at + INTERVAL 8 HOUR, '%Y-%m-%d')
            """)
    List<DashboardDayAgg> sumAmountGroupedByShanghaiDay(
            @Param("type") String type,
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);

    @Select("""
            SELECT DATE_FORMAT(created_at + INTERVAL 8 HOUR, '%Y-%m-%d') AS day_sh,
                   COALESCE(SUM(ABS(amount_li)), 0) AS amount_li,
                   COUNT(*) AS cnt
            FROM token_ledger_entries
            WHERE type = #{type}
              AND created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            GROUP BY DATE_FORMAT(created_at + INTERVAL 8 HOUR, '%Y-%m-%d')
            """)
    List<DashboardDayAgg> sumAbsAmountGroupedByShanghaiDay(
            @Param("type") String type,
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);
}
