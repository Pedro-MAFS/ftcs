package com.mfs.tokengateway.db.dbservice;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenRequestLogMapper;
import com.mfs.tokengateway.db.po.TokenRequestLog;

/** {@code token_request_logs}（G0-09 落库 + G0-10 认领/回填）。 */
@Service
public class TokenRequestLogDbService extends ServiceImpl<TokenRequestLogMapper, TokenRequestLog> {

    public static final String BILLING_PENDING = "pending";
    public static final String BILLING_SETTLING = "settling";
    public static final String BILLING_CHARGED = "charged";
    public static final String BILLING_SKIPPED = "skipped_no_usage";
    public static final String BILLING_SETTLE_FAILED = "settle_failed";

    public void insertLog(TokenRequestLog log) {
        save(log);
    }

    /**
     * 认领最多 {@code limit} 条 pending → settling（SKIP LOCKED）。
     */
    @Transactional
    public List<TokenRequestLog> claimPending(String owner, int limit) {
        if (limit <= 0) {
            return List.of();
        }
        List<String> ids = getBaseMapper().selectPendingIds(limit);
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        LocalDateTime now = LocalDateTime.now();
        boolean ok = update(new LambdaUpdateWrapper<TokenRequestLog>()
                .in(TokenRequestLog::getRequestId, ids)
                .eq(TokenRequestLog::getBillingStatus, BILLING_PENDING)
                .set(TokenRequestLog::getBillingStatus, BILLING_SETTLING)
                .set(TokenRequestLog::getSettleOwner, owner)
                .set(TokenRequestLog::getSettleClaimedAt, now));
        if (!ok) {
            return List.of();
        }
        List<TokenRequestLog> rows = list(new LambdaQueryWrapper<TokenRequestLog>()
                .in(TokenRequestLog::getRequestId, ids)
                .eq(TokenRequestLog::getBillingStatus, BILLING_SETTLING)
                .eq(TokenRequestLog::getSettleOwner, owner));
        return rows == null ? List.of() : rows;
    }

    /** 超时 settling → pending，清空认领字段。 */
    public int reclaimStaleSettling(LocalDateTime claimedBefore) {
        return getBaseMapper().update(
                null,
                new LambdaUpdateWrapper<TokenRequestLog>()
                        .eq(TokenRequestLog::getBillingStatus, BILLING_SETTLING)
                        .lt(TokenRequestLog::getSettleClaimedAt, claimedBefore)
                        .set(TokenRequestLog::getBillingStatus, BILLING_PENDING)
                        .set(TokenRequestLog::getSettleOwner, null)
                        .set(TokenRequestLog::getSettleClaimedAt, null));
    }

    public boolean markSettleFailedIfSettling(String requestId, String owner) {
        return update(new LambdaUpdateWrapper<TokenRequestLog>()
                .eq(TokenRequestLog::getRequestId, requestId)
                .eq(TokenRequestLog::getBillingStatus, BILLING_SETTLING)
                .eq(TokenRequestLog::getSettleOwner, owner)
                .set(TokenRequestLog::getBillingStatus, BILLING_SETTLE_FAILED)
                .set(TokenRequestLog::getSettleOwner, null)
                .set(TokenRequestLog::getSettleClaimedAt, null));
    }

    /**
     * 回填金额并置 charged；须仍为本 owner 的 settling。
     *
     * @return 影响行数
     */
    public int markChargedIfSettling(
            String requestId,
            String owner,
            long revenueLi,
            long cogsLi,
            long marginLi) {
        return getBaseMapper().update(
                null,
                new LambdaUpdateWrapper<TokenRequestLog>()
                        .eq(TokenRequestLog::getRequestId, requestId)
                        .eq(TokenRequestLog::getBillingStatus, BILLING_SETTLING)
                        .eq(TokenRequestLog::getSettleOwner, owner)
                        .set(TokenRequestLog::getRevenueLi, revenueLi)
                        .set(TokenRequestLog::getCogsLi, cogsLi)
                        .set(TokenRequestLog::getMarginLi, marginLi)
                        .set(TokenRequestLog::getBillingStatus, BILLING_CHARGED)
                        .set(TokenRequestLog::getSettleOwner, null)
                        .set(TokenRequestLog::getSettleClaimedAt, null));
    }

    public List<TokenRequestLog> listByIds(List<String> requestIds) {
        if (requestIds == null || requestIds.isEmpty()) {
            return Collections.emptyList();
        }
        return list(new LambdaQueryWrapper<TokenRequestLog>().in(TokenRequestLog::getRequestId, requestIds));
    }
}
