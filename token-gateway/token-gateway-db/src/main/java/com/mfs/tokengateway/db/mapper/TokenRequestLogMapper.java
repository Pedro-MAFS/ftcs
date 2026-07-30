package com.mfs.tokengateway.db.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
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
}
