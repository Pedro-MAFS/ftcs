package com.mfs.tokengateway.db.mapper;

import java.time.LocalDateTime;
import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mfs.tokengateway.db.dbservice.DashboardDayAgg;
import com.mfs.tokengateway.db.dbservice.RequestCogsMarginSum;
import com.mfs.tokengateway.db.po.TokenRequestLog;

@Mapper
public interface TokenRequestLogMapper extends BaseMapper<TokenRequestLog> {

    /**
     * 选出 pending 主键（须在事务内；调度侧已有 ShedLock，无需 SKIP LOCKED）。
     */
    @Select("""
            SELECT request_id FROM token_request_logs
            WHERE billing_status = 'pending'
            ORDER BY created_at ASC
            LIMIT #{limit}
            """)
    List<String> selectPendingIds(@Param("limit") int limit);

    @Select("""
            SELECT COUNT(DISTINCT user_id) FROM token_request_logs
            WHERE created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            """)
    long countDistinctUsersBetween(
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);

    @Select("""
            SELECT DATE_FORMAT(created_at + INTERVAL 8 HOUR, '%Y-%m-%d') AS day_sh,
                   COUNT(DISTINCT user_id) AS users
            FROM token_request_logs
            WHERE created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            GROUP BY DATE_FORMAT(created_at + INTERVAL 8 HOUR, '%Y-%m-%d')
            """)
    List<DashboardDayAgg> countDistinctUsersGroupedByShanghaiDay(
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);

    /** 已结算请求的成本/毛利合计（上海业务日窗；created_at）。 */
    @Select("""
            SELECT COALESCE(SUM(cogs_li), 0) AS cogs_li,
                   COALESCE(SUM(margin_li), 0) AS margin_li
            FROM token_request_logs
            WHERE billing_status = 'charged'
              AND created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            """)
    RequestCogsMarginSum sumCogsMarginChargedBetween(
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);
}
