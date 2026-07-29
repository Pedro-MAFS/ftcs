package com.mfs.tokengateway.db.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mfs.tokengateway.db.po.TokenRequestLog;

@Mapper
public interface TokenRequestLogMapper extends BaseMapper<TokenRequestLog> {
}
