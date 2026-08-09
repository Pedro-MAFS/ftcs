package com.mfs.tokengateway.db.dbservice;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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

    /**
     * 记录主动查单摘要（不依赖订单开放态；订单不存在则 0 行）。
     */
    public int touchLastSync(
            String outTradeNo, String tradeState, String result, LocalDateTime syncedAt) {
        return getBaseMapper()
                .update(
                        null,
                        new LambdaUpdateWrapper<TokenWechatPayOrder>()
                                .eq(TokenWechatPayOrder::getOutTradeNo, outTradeNo)
                                .set(TokenWechatPayOrder::getLastSyncAt, syncedAt)
                                .set(TokenWechatPayOrder::getLastSyncTradeState, tradeState)
                                .set(TokenWechatPayOrder::getLastSyncResult, result)
                                .setSql("sync_count = IFNULL(sync_count, 0) + 1"));
    }

    /** 定时补单扫描开放态订单。 */
    public List<TokenWechatPayOrder> listOpenForSync(
            LocalDateTime createdBefore, LocalDateTime createdAfter, int limit) {
        int n = Math.max(1, limit);
        return getBaseMapper().selectOpenForSync(createdBefore, createdAfter, n);
    }

    /**
     * 管理端微信订单分页（US-G6-11）。
     *
     * @param statusExact 精确 status；null/blank 表示不限
     * @param outTradeNoExact 精确商户单号；null/blank 表示不限
     */
    public IPage<TokenWechatPayOrder> pageForAdmin(
            Long userId,
            String statusExact,
            String outTradeNoExact,
            LocalDateTime fromInclusive,
            LocalDateTime toInclusive,
            int page,
            int size) {
        LambdaQueryWrapper<TokenWechatPayOrder> w = new LambdaQueryWrapper<>();
        if (userId != null) {
            w.eq(TokenWechatPayOrder::getUserId, userId);
        }
        if (StringUtils.hasText(statusExact)) {
            w.eq(TokenWechatPayOrder::getStatus, statusExact.trim());
        }
        if (StringUtils.hasText(outTradeNoExact)) {
            w.eq(TokenWechatPayOrder::getOutTradeNo, outTradeNoExact.trim());
        }
        if (fromInclusive != null) {
            w.ge(TokenWechatPayOrder::getCreatedAt, fromInclusive);
        }
        if (toInclusive != null) {
            w.le(TokenWechatPayOrder::getCreatedAt, toInclusive);
        }
        w.orderByDesc(TokenWechatPayOrder::getCreatedAt).orderByDesc(TokenWechatPayOrder::getId);
        long total = count(w);
        long offset = (long) (page - 1) * size;
        w.last("LIMIT " + offset + "," + size);
        List<TokenWechatPayOrder> records = list(w);
        Page<TokenWechatPayOrder> result = new Page<>(page, size, total, false);
        result.setRecords(records != null ? records : List.of());
        return result;
    }

    /**
     * 用户面板充值列表（US-G4-04）：按用户 + 下单时间窗 + 键集游标降序。
     *
     * @param cursorCreatedAt 上一页最后一行 created_at；首页传 null
     * @param cursorId 上一页最后一行 id；首页传 null
     */
    public List<TokenWechatPayOrder> listForPortal(
            long userId,
            LocalDateTime fromInclusive,
            LocalDateTime toInclusive,
            LocalDateTime cursorCreatedAt,
            Long cursorId,
            int limit) {
        if (limit <= 0) {
            return List.of();
        }
        LambdaQueryWrapper<TokenWechatPayOrder> q = new LambdaQueryWrapper<TokenWechatPayOrder>()
                .eq(TokenWechatPayOrder::getUserId, userId)
                .ge(TokenWechatPayOrder::getCreatedAt, fromInclusive)
                .le(TokenWechatPayOrder::getCreatedAt, toInclusive);
        if (cursorCreatedAt != null && cursorId != null) {
            q.and(w -> w.lt(TokenWechatPayOrder::getCreatedAt, cursorCreatedAt)
                    .or(w2 -> w2.eq(TokenWechatPayOrder::getCreatedAt, cursorCreatedAt)
                            .lt(TokenWechatPayOrder::getId, cursorId)));
        }
        q.orderByDesc(TokenWechatPayOrder::getCreatedAt).orderByDesc(TokenWechatPayOrder::getId);
        q.last("LIMIT " + limit);
        List<TokenWechatPayOrder> rows = list(q);
        return rows == null ? List.of() : rows;
    }
}
