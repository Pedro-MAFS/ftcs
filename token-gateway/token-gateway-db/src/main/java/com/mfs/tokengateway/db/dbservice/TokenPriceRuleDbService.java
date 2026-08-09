package com.mfs.tokengateway.db.dbservice;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenPriceRuleMapper;
import com.mfs.tokengateway.db.po.TokenPriceRule;

/** {@code token_price_rules} 持久化（US-G0-09 / US-G6-10）。 */
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

    /** 全部价目，按 model 升序、effective_from 降序（US-G6-10）。 */
    public List<TokenPriceRule> listAllOrderByModelFromDesc() {
        return list(new LambdaQueryWrapper<TokenPriceRule>()
                .orderByAsc(TokenPriceRule::getModel)
                .orderByDesc(TokenPriceRule::getEffectiveFrom));
    }

    /** 某 model 价目时间线，effective_from 降序（US-G6-10）。 */
    public List<TokenPriceRule> listByModelOrderByFromDesc(String model) {
        return list(new LambdaQueryWrapper<TokenPriceRule>()
                .eq(TokenPriceRule::getModel, model)
                .orderByDesc(TokenPriceRule::getEffectiveFrom));
    }

    /**
     * INSERT 新价目版本；调用方须自行处理唯一键冲突。
     *
     * @return 是否插入成功（MyBatis-Plus {@code save}）
     */
    public boolean insertNew(TokenPriceRule row) {
        return save(row);
    }
}
