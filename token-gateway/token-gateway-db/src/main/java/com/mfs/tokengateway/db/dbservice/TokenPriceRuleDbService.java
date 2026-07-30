package com.mfs.tokengateway.db.dbservice;

import java.time.LocalDateTime;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenPriceRuleMapper;
import com.mfs.tokengateway.db.po.TokenPriceRule;

/** {@code token_price_rules} 持久化（US-G0-09）。 */
@Service
public class TokenPriceRuleDbService extends ServiceImpl<TokenPriceRuleMapper, TokenPriceRule> {

    /**
     * 取 {@code model} 在 {@code asOfUtc} 及以前生效的最新价目；无则 {@code null}。
     */
    public TokenPriceRule findEffective(String model, LocalDateTime asOfUtc) {
        return getOne(
                new LambdaQueryWrapper<TokenPriceRule>()
                        .eq(TokenPriceRule::getModel, model)
                        .le(TokenPriceRule::getEffectiveFrom, asOfUtc)
                        .orderByDesc(TokenPriceRule::getEffectiveFrom)
                        .last("LIMIT 1"),
                false);
    }
}
