package com.mfs.tokengateway.db.mapper;

import java.time.LocalDateTime;
import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;

@Mapper
public interface TokenWechatPayOrderMapper extends BaseMapper<TokenWechatPayOrder> {

    @Select("SELECT * FROM token_wechat_pay_orders WHERE out_trade_no = #{outTradeNo} FOR UPDATE")
    TokenWechatPayOrder selectByOutTradeNoForUpdate(@Param("outTradeNo") String outTradeNo);

    /**
     * 定时补单候选：开放态、落在 [createdAfter, createdBefore]；优先未查过 / 最久未查。
     */
    @Select(
            """
            SELECT * FROM token_wechat_pay_orders
             WHERE status IN ('created', 'paid')
               AND created_at <= #{createdBefore}
               AND created_at >= #{createdAfter}
             ORDER BY (last_sync_at IS NULL) DESC, last_sync_at ASC, created_at ASC
             LIMIT #{limit}
            """)
    List<TokenWechatPayOrder> selectOpenForSync(
            @Param("createdBefore") LocalDateTime createdBefore,
            @Param("createdAfter") LocalDateTime createdAfter,
            @Param("limit") int limit);
}
