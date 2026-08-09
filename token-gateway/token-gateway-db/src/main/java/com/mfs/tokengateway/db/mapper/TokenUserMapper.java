package com.mfs.tokengateway.db.mapper;

import java.time.LocalDateTime;
import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mfs.tokengateway.db.dbservice.DashboardDayAgg;
import com.mfs.tokengateway.db.po.TokenUser;

@Mapper
public interface TokenUserMapper extends BaseMapper<TokenUser> {

    @Select("SELECT * FROM token_users WHERE id = #{id} FOR UPDATE")
    TokenUser selectByIdForUpdate(@Param("id") long id);

    @Select("""
            SELECT COUNT(*) FROM token_users
            WHERE created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            """)
    long countCreatedBetween(
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);

    /**
     * 按上海日归桶（UTC DATETIME + 8h）；day_sh = YYYY-MM-DD。
     */
    @Select("""
            SELECT DATE_FORMAT(created_at + INTERVAL 8 HOUR, '%Y-%m-%d') AS day_sh,
                   COUNT(*) AS users
            FROM token_users
            WHERE created_at >= #{fromInclusive} AND created_at < #{toExclusive}
            GROUP BY DATE_FORMAT(created_at + INTERVAL 8 HOUR, '%Y-%m-%d')
            """)
    List<DashboardDayAgg> countCreatedGroupedByShanghaiDay(
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);
}
