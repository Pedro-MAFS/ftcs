package com.mfs.tokengateway.db.dbservice;

import java.util.List;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenApiKeyMapper;
import com.mfs.tokengateway.db.po.TokenApiKey;

/** {@code token_api_keys} 持久化（业务侧注入本类，不直接用 Mapper）。 */
@Service
public class TokenApiKeyDbService extends ServiceImpl<TokenApiKeyMapper, TokenApiKey> {

    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_DISABLED = "disabled";

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

    /** 管理端按用户 + name 更新 status（US-G6-05）。 */
    public boolean updateStatus(long userId, String name, String status) {
        return update(new LambdaUpdateWrapper<TokenApiKey>()
                .eq(TokenApiKey::getUserId, userId)
                .eq(TokenApiKey::getName, name)
                .set(TokenApiKey::getStatus, status));
    }

    /** 管理端详情 Key 计数摘要（US-G6-04）；不含明文 / hash。 */
    public KeyStatusCounts countByUserId(long userId) {
        List<TokenApiKey> keys = listByUserId(userId);
        long active = 0;
        long disabled = 0;
        for (TokenApiKey key : keys) {
            if (STATUS_DISABLED.equalsIgnoreCase(key.getStatus())) {
                disabled++;
            } else if (STATUS_ACTIVE.equalsIgnoreCase(key.getStatus())) {
                active++;
            }
        }
        return new KeyStatusCounts(keys.size(), active, disabled);
    }

    public record KeyStatusCounts(long total, long active, long disabled) {}
}
