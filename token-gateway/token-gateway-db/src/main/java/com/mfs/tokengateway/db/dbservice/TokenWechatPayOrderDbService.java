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

    /** 行锁；须在事务内调用。 */
    public TokenWechatPayOrder lockByOutTradeNo(String outTradeNo) {
        return getBaseMapper().selectByOutTradeNoForUpdate(outTradeNo);
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

    /**
     * 仅当订单仍为未入账开放态时关单（created/paid/failed → closed）。
     *
     * @return 更新行数
     */
    public int markClosedIfOpen(long id, String failReason, LocalDateTime updatedAt) {
        return getBaseMapper().update(
                null,
                new LambdaUpdateWrapper<TokenWechatPayOrder>()
                        .eq(TokenWechatPayOrder::getId, id)
                        .in(TokenWechatPayOrder::getStatus, "created", "paid", "failed")
                        .set(TokenWechatPayOrder::getStatus, "closed")
                        .set(TokenWechatPayOrder::getFailReason, failReason)
                        .set(TokenWechatPayOrder::getUpdatedAt, updatedAt));
    }

    /**
     * 仅当订单仍为未入账开放态时标失败（created/paid → failed；已 failed 可刷新原因）。
     */
    public int markFailedIfOpen(long id, String failReason, LocalDateTime updatedAt) {
        return getBaseMapper().update(
                null,
                new LambdaUpdateWrapper<TokenWechatPayOrder>()
                        .eq(TokenWechatPayOrder::getId, id)
                        .in(TokenWechatPayOrder::getStatus, "created", "paid", "failed")
                        .set(TokenWechatPayOrder::getStatus, "failed")
                        .set(TokenWechatPayOrder::getFailReason, failReason)
                        .set(TokenWechatPayOrder::getUpdatedAt, updatedAt));
    }

    public boolean markCredited(
            long id,
            String wxTransactionId,
            LocalDateTime paidAt,
            LocalDateTime creditedAt) {
        return update(new LambdaUpdateWrapper<TokenWechatPayOrder>()
                .eq(TokenWechatPayOrder::getId, id)
                .set(TokenWechatPayOrder::getStatus, "credited")
                .set(TokenWechatPayOrder::getWxTransactionId, wxTransactionId)
                .set(TokenWechatPayOrder::getPaidAt, paidAt)
                .set(TokenWechatPayOrder::getCreditedAt, creditedAt)
                .set(TokenWechatPayOrder::getUpdatedAt, creditedAt));
    }

    /**
     * 记录验签成功的回调摘要（不依赖订单开放态；订单不存在则 0 行）。
     */
    public int touchLastNotify(
            String outTradeNo, String tradeState, String result, LocalDateTime notifiedAt) {
        return getBaseMapper()
                .update(
                        null,
                        new LambdaUpdateWrapper<TokenWechatPayOrder>()
                                .eq(TokenWechatPayOrder::getOutTradeNo, outTradeNo)
                                .set(TokenWechatPayOrder::getLastNotifyAt, notifiedAt)
                                .set(TokenWechatPayOrder::getLastNotifyTradeState, tradeState)
                                .set(TokenWechatPayOrder::getLastNotifyResult, result)
                                .setSql("notify_count = IFNULL(notify_count, 0) + 1"));
    }
}
