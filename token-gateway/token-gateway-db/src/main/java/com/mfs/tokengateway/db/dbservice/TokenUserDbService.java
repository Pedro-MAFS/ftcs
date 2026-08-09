package com.mfs.tokengateway.db.dbservice;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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

    /**
     * 管理端用户分页（US-G6-04）。
     *
     * @param page 从 1 开始
     * @param size 页大小
     */
    public IPage<TokenUser> pageUsers(
            String q,
            String status,
            String tenantIdExact,
            String userCodeExact,
            int page,
            int size) {
        LambdaQueryWrapper<TokenUser> w = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(status)) {
            w.eq(TokenUser::getStatus, status.trim());
        }
        if (StringUtils.hasText(tenantIdExact)) {
            w.eq(TokenUser::getTenantId, tenantIdExact.trim());
        }
        if (StringUtils.hasText(userCodeExact)) {
            w.eq(TokenUser::getUserCode, userCodeExact.trim());
        } else if (StringUtils.hasText(q)) {
            String keyword = q.trim();
            w.and(x -> {
                x.like(TokenUser::getUserCode, keyword).or().like(TokenUser::getTenantId, keyword);
                if (keyword.chars().allMatch(Character::isDigit)) {
                    try {
                        x.or().eq(TokenUser::getId, Long.parseLong(keyword));
                    } catch (NumberFormatException ignored) {
                        // ignore overflow
                    }
                }
            });
        }
        w.orderByDesc(TokenUser::getId);
        long total = count(w);
        long offset = (long) (page - 1) * size;
        // 3.5.9 默认未引入 jsqlparser 分页插件；用安全的整型 LIMIT 即可
        w.last("LIMIT " + offset + "," + size);
        List<TokenUser> records = list(w);
        Page<TokenUser> result = new Page<>(page, size, total, false);
        result.setRecords(records != null ? records : List.of());
        return result;
    }

    /** 更新账户状态（US-G6-04）。 */
    public boolean updateStatus(long userId, String newStatus) {
        return update(new LambdaUpdateWrapper<TokenUser>()
                .eq(TokenUser::getId, userId)
                .set(TokenUser::getStatus, newStatus));
    }

    /** 批量按 id 加载（US-G6-06 join user_code）。 */
    public List<TokenUser> listByIds(Collection<? extends java.io.Serializable> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        List<TokenUser> rows = list(new LambdaQueryWrapper<TokenUser>().in(TokenUser::getId, ids));
        return rows == null ? List.of() : rows;
    }

    /**
     * 按 user_code 模糊查 id（US-G6-06 {@code q}）；最多 {@code limit} 条。
     */
    public List<TokenUser> findByUserCodeLike(String keyword, int limit) {
        if (!StringUtils.hasText(keyword) || limit <= 0) {
            return List.of();
        }
        List<TokenUser> rows = list(new LambdaQueryWrapper<TokenUser>()
                .like(TokenUser::getUserCode, keyword.trim())
                .orderByDesc(TokenUser::getId)
                .last("LIMIT " + limit));
        return rows == null ? List.of() : rows;
    }

    /** 看板：时间窗内新增用户数（US-G6-02）。 */
    public long countCreatedBetween(LocalDateTime fromInclusive, LocalDateTime toExclusive) {
        return getBaseMapper().countCreatedBetween(fromInclusive, toExclusive);
    }

    /** 看板：按上海日归桶的新增用户（US-G6-02）。 */
    public List<DashboardDayAgg> countCreatedGroupedByShanghaiDay(
            LocalDateTime fromInclusive, LocalDateTime toExclusive) {
        List<DashboardDayAgg> rows =
                getBaseMapper().countCreatedGroupedByShanghaiDay(fromInclusive, toExclusive);
        return rows == null ? List.of() : rows;
    }
}
