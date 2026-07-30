package com.mfs.tokengateway.db.dbservice;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenUserMapper;
import com.mfs.tokengateway.db.po.TokenUser;

/** {@code token_users} 持久化（业务侧注入本类，不直接用 Mapper）。 */
@Service
public class TokenUserDbService extends ServiceImpl<TokenUserMapper, TokenUser> {

    /** 按 UC 身份键查账户；不存在返回 {@code null}。 */
    public TokenUser findByTenantIdAndUserCode(String tenantId, String userCode) {
        return getOne(new LambdaQueryWrapper<TokenUser>()
                .eq(TokenUser::getTenantId, tenantId)
                .eq(TokenUser::getUserCode, userCode));
    }

    /** 行锁；须在事务内调用。 */
    public TokenUser lockById(long userId) {
        return getBaseMapper().selectByIdForUpdate(userId);
    }

    public boolean updateBalanceLi(long userId, long newBalanceLi) {
        return update(new LambdaUpdateWrapper<TokenUser>()
                .eq(TokenUser::getId, userId)
                .set(TokenUser::getBalanceLi, newBalanceLi));
    }
}
