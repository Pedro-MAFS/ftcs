package com.mfs.tokengateway.db.dbservice;

import java.time.LocalDateTime;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenWechatPayOrderMapper;
import com.mfs.tokengateway.db.po.TokenWechatPayOrder;

/** {@code token_wechat_pay_orders} 持久化。 */
@Service
public class TokenWechatPayOrderDbService extends ServiceImpl<TokenWechatPayOrderMapper, TokenWechatPayOrder> {

    public TokenWechatPayOrder findByOutTradeNo(String outTradeNo) {
        return getOne(new LambdaQueryWrapper<TokenWechatPayOrder>()
                .eq(TokenWechatPayOrder::getOutTradeNo, outTradeNo));
    }

    public boolean markCreatedWithCodeUrl(long id, String codeUrl, LocalDateTime updatedAt) {
        return update(new LambdaUpdateWrapper<TokenWechatPayOrder>()
                .eq(TokenWechatPayOrder::getId, id)
                .set(TokenWechatPayOrder::getCodeUrl, codeUrl)
                .set(TokenWechatPayOrder::getStatus, "created")
                .set(TokenWechatPayOrder::getUpdatedAt, updatedAt));
    }

    public boolean markFailed(long id, String failReason, LocalDateTime updatedAt) {
        return update(new LambdaUpdateWrapper<TokenWechatPayOrder>()
                .eq(TokenWechatPayOrder::getId, id)
                .set(TokenWechatPayOrder::getStatus, "failed")
                .set(TokenWechatPayOrder::getFailReason, failReason)
                .set(TokenWechatPayOrder::getUpdatedAt, updatedAt));
    }
}
