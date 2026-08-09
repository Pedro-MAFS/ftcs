package com.mfs.tokengateway.db.dbservice;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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

    /**
     * 用户面板消费列表（US-G4-03）：按用户 + 时间窗 + 键集游标降序。
     *
     * @param cursorCreatedAt 上一页最后一行 created_at；首页传 null
     * @param cursorRequestId 上一页最后一行 request_id；首页传 null
     */
    public List<TokenRequestLog> listForPortal(
            long userId,
            LocalDateTime fromInclusive,
            LocalDateTime toInclusive,
            LocalDateTime cursorCreatedAt,
            String cursorRequestId,
            int limit) {
        if (limit <= 0) {
            return List.of();
        }
        LambdaQueryWrapper<TokenRequestLog> q = new LambdaQueryWrapper<TokenRequestLog>()
                .eq(TokenRequestLog::getUserId, userId)
                .ge(TokenRequestLog::getCreatedAt, fromInclusive)
                .le(TokenRequestLog::getCreatedAt, toInclusive);
        if (cursorCreatedAt != null && cursorRequestId != null && !cursorRequestId.isBlank()) {
            q.and(w -> w.lt(TokenRequestLog::getCreatedAt, cursorCreatedAt)
                    .or(w2 -> w2.eq(TokenRequestLog::getCreatedAt, cursorCreatedAt)
                            .lt(TokenRequestLog::getRequestId, cursorRequestId)));
        }
        q.orderByDesc(TokenRequestLog::getCreatedAt).orderByDesc(TokenRequestLog::getRequestId);
        q.last("LIMIT " + limit);
        List<TokenRequestLog> rows = list(q);
        return rows == null ? List.of() : rows;
    }

    /** 管理端按 request_id 查单条（US-G6-06）。 */
    public TokenRequestLog findByRequestId(String requestId) {
        if (requestId == null || requestId.isBlank()) {
            return null;
        }
        return getById(requestId);
    }

    /**
     * 管理端请求计量分页（US-G6-06）。
     *
     * @param ignoreTimeWindow 精确 request_id 查询时为 true
     * @param userIdsIn        {@code q} 解析出的用户 id 集合；与 {@code userId} 互斥使用
     */
    public IPage<TokenRequestLog> pageForAdmin(
            Long userId,
            Collection<Long> userIdsIn,
            String requestIdExact,
            String model,
            String billingStatus,
            String keyName,
            String status,
            LocalDateTime fromInclusive,
            LocalDateTime toInclusive,
            boolean ignoreTimeWindow,
            int page,
            int size) {
        LambdaQueryWrapper<TokenRequestLog> w = new LambdaQueryWrapper<>();
        if (requestIdExact != null && !requestIdExact.isBlank()) {
            w.eq(TokenRequestLog::getRequestId, requestIdExact.trim());
        } else {
            if (userId != null) {
                w.eq(TokenRequestLog::getUserId, userId);
            } else if (userIdsIn != null && !userIdsIn.isEmpty()) {
                w.in(TokenRequestLog::getUserId, userIdsIn);
            }
            if (model != null && !model.isBlank()) {
                w.eq(TokenRequestLog::getModel, model.trim());
            }
            if (billingStatus != null && !billingStatus.isBlank()) {
                w.eq(TokenRequestLog::getBillingStatus, billingStatus.trim());
            }
            if (keyName != null && !keyName.isBlank()) {
                w.eq(TokenRequestLog::getKeyName, keyName.trim());
            }
            if (status != null && !status.isBlank()) {
                w.eq(TokenRequestLog::getStatus, status.trim());
            }
            if (!ignoreTimeWindow) {
                w.ge(TokenRequestLog::getCreatedAt, fromInclusive);
                w.le(TokenRequestLog::getCreatedAt, toInclusive);
            }
        }
        w.orderByDesc(TokenRequestLog::getCreatedAt).orderByDesc(TokenRequestLog::getRequestId);
        long total = count(w);
        long offset = (long) (page - 1) * size;
        w.last("LIMIT " + offset + "," + size);
        List<TokenRequestLog> records = list(w);
        Page<TokenRequestLog> result = new Page<>(page, size, total, false);
        result.setRecords(records != null ? records : List.of());
        return result;
    }
}
