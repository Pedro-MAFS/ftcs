package com.mfs.tokengateway.db.dbservice;

import java.time.LocalDateTime;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenRechargeTicketMapper;
import com.mfs.tokengateway.db.po.TokenRechargeTicket;

/** {@code token_recharge_tickets} 持久化。 */
@Service
public class TokenRechargeTicketDbService extends ServiceImpl<TokenRechargeTicketMapper, TokenRechargeTicket> {

    public TokenRechargeTicket findByTicketHash(String ticketHash) {
        return getOne(new LambdaQueryWrapper<TokenRechargeTicket>()
                .eq(TokenRechargeTicket::getTicketHash, ticketHash));
    }

    /** 统计自 {@code since}（含）起该身份已签发张数（含已过期，用于限流）。 */
    public long countCreatedSince(String tenantId, String userCode, LocalDateTime since) {
        return count(new LambdaQueryWrapper<TokenRechargeTicket>()
                .eq(TokenRechargeTicket::getTenantId, tenantId)
                .eq(TokenRechargeTicket::getUserCode, userCode)
                .ge(TokenRechargeTicket::getCreatedAt, since));
    }

    public boolean updateLastUsedAt(long id, LocalDateTime lastUsedAt) {
        return update(new LambdaUpdateWrapper<TokenRechargeTicket>()
                .eq(TokenRechargeTicket::getId, id)
                .set(TokenRechargeTicket::getLastUsedAt, lastUsedAt));
    }
}
