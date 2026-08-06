package com.mfs.tokengateway.db.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;

@Mapper
public interface TokenWechatPayOrderMapper extends BaseMapper<TokenWechatPayOrder> {

    @Select("SELECT * FROM token_wechat_pay_orders WHERE out_trade_no = #{outTradeNo} FOR UPDATE")
    TokenWechatPayOrder selectByOutTradeNoForUpdate(@Param("outTradeNo") String outTradeNo);
}
