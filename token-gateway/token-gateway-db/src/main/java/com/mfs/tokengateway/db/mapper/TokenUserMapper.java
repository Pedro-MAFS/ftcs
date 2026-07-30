package com.mfs.tokengateway.db.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mfs.tokengateway.db.po.TokenUser;

@Mapper
public interface TokenUserMapper extends BaseMapper<TokenUser> {

    @Select("SELECT * FROM token_users WHERE id = #{id} FOR UPDATE")
    TokenUser selectByIdForUpdate(@Param("id") long id);
}
