package com.mfs.tokengateway.db.dbservice;

import java.util.List;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenApiKeyMapper;
import com.mfs.tokengateway.db.po.TokenApiKey;

/** {@code token_api_keys} 持久化（业务侧注入本类，不直接用 Mapper）。 */
@Service
public class TokenApiKeyDbService extends ServiceImpl<TokenApiKeyMapper, TokenApiKey> {

    /** 按用户 + Key 名查；不存在返回 {@code null}。 */
    public TokenApiKey findByUserIdAndName(Long userId, String name) {
        return getOne(new LambdaQueryWrapper<TokenApiKey>()
                .eq(TokenApiKey::getUserId, userId)
                .eq(TokenApiKey::getName, name));
    }

    /** 按 key_hash 查；不存在返回 {@code null}。 */
    public TokenApiKey findByKeyHash(String keyHash) {
        return getOne(new LambdaQueryWrapper<TokenApiKey>().eq(TokenApiKey::getKeyHash, keyHash));
    }

    /** 用户面板 Key 列表（US-G4-08）：按 name 升序。 */
    public List<TokenApiKey> listByUserId(long userId) {
        List<TokenApiKey> rows = list(new LambdaQueryWrapper<TokenApiKey>()
                .eq(TokenApiKey::getUserId, userId)
                .orderByAsc(TokenApiKey::getName));
        return rows == null ? List.of() : rows;
    }
}
