package com.mfs.tokengateway.db.dbservice;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenLedgerEntryMapper;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;

/** {@code token_ledger_entries}（G0-10 charge；G3-02 topup；G6-06/07 分页与调账）。 */
@Service
public class TokenLedgerEntryDbService extends ServiceImpl<TokenLedgerEntryMapper, TokenLedgerEntry> {

    public static final String TYPE_CHARGE = "charge";
    public static final String TYPE_TOPUP = "topup";
    public static final String TYPE_ADJUST = "adjust";
    /** 管理端筛选：topup ∪ adjust（US-G6-07）。 */
    public static final String TYPE_FILTER_CREDITS = "credits";

    public void insertCharge(TokenLedgerEntry entry) {
        save(entry);
    }

    public void insertTopup(TokenLedgerEntry entry) {
        entry.setType(TYPE_TOPUP);
        save(entry);
    }

    public void insertAdjust(TokenLedgerEntry entry) {
        entry.setType(TYPE_ADJUST);
        save(entry);
    }

    /** 按 request_id 查关联流水（通常 charge）；不存在返回 null。 */
    public TokenLedgerEntry findByRequestId(String requestId) {
        if (requestId == null || requestId.isBlank()) {
            return null;
        }
        return getOne(new LambdaQueryWrapper<TokenLedgerEntry>()
                .eq(TokenLedgerEntry::getRequestId, requestId.trim()));
    }

    /**
     * 管理端账本分页（US-G6-06 / G6-07）。
     *
     * @param typeExact {@code null}/blank 表示不限（{@code all}）；
     *     {@code credits} → IN (topup, adjust)；否则精确 type
     */
    public IPage<TokenLedgerEntry> pageForAdmin(
            Long userId,
            Collection<Long> userIdsIn,
            String typeExact,
            String requestId,
            String operator,
            LocalDateTime fromInclusive,
            LocalDateTime toInclusive,
            int page,
            int size) {
        LambdaQueryWrapper<TokenLedgerEntry> w = new LambdaQueryWrapper<>();
        if (userId != null) {
            w.eq(TokenLedgerEntry::getUserId, userId);
        } else if (userIdsIn != null && !userIdsIn.isEmpty()) {
            w.in(TokenLedgerEntry::getUserId, userIdsIn);
        }
        if (StringUtils.hasText(typeExact)) {
            String t = typeExact.trim();
            if (TYPE_FILTER_CREDITS.equalsIgnoreCase(t)) {
                w.in(TokenLedgerEntry::getType, List.of(TYPE_TOPUP, TYPE_ADJUST));
            } else {
                w.eq(TokenLedgerEntry::getType, t);
            }
        }
        if (StringUtils.hasText(requestId)) {
            w.eq(TokenLedgerEntry::getRequestId, requestId.trim());
        }
        if (StringUtils.hasText(operator)) {
            w.eq(TokenLedgerEntry::getOperator, operator.trim());
        }
        if (fromInclusive != null) {
            w.ge(TokenLedgerEntry::getCreatedAt, fromInclusive);
        }
        if (toInclusive != null) {
            w.le(TokenLedgerEntry::getCreatedAt, toInclusive);
        }
        w.orderByDesc(TokenLedgerEntry::getCreatedAt).orderByDesc(TokenLedgerEntry::getId);
        long total = count(w);
        long offset = (long) (page - 1) * size;
        w.last("LIMIT " + offset + "," + size);
        List<TokenLedgerEntry> records = list(w);
        Page<TokenLedgerEntry> result = new Page<>(page, size, total, false);
        result.setRecords(records != null ? records : List.of());
        return result;
    }
}
