package com.mfs.tokengateway.server.application;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * 用户 sync 内存限流（US-G3-03）：同单 ≥3s 间隔；同身份每分钟 ≤20。
 */
@Component
public class WechatSyncRateLimiter {

    static final Duration MIN_INTERVAL_PER_ORDER = Duration.ofSeconds(3);
    static final int MAX_PER_IDENTITY_PER_MINUTE = 20;
    private static final Duration IDENTITY_WINDOW = Duration.ofMinutes(1);

    private final ConcurrentHashMap<String, Instant> lastByOutTradeNo = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<Instant>> hitsByIdentity = new ConcurrentHashMap<>();

    /**
     * @return true 表示允许本次 sync；false 表示应返回 429
     */
    public boolean tryAcquire(String tenantId, String userCode, String outTradeNo, Instant now) {
        String orderKey = outTradeNo == null ? "" : outTradeNo.trim();
        Instant last = lastByOutTradeNo.get(orderKey);
        if (last != null && Duration.between(last, now).compareTo(MIN_INTERVAL_PER_ORDER) < 0) {
            return false;
        }

        String identityKey = identityKey(tenantId, userCode);
        Deque<Instant> hits =
                hitsByIdentity.computeIfAbsent(identityKey, k -> new ArrayDeque<>());
        synchronized (hits) {
            prune(hits, now.minus(IDENTITY_WINDOW));
            if (hits.size() >= MAX_PER_IDENTITY_PER_MINUTE) {
                return false;
            }
            hits.addLast(now);
        }
        lastByOutTradeNo.put(orderKey, now);
        return true;
    }

    /** 测试用：清空状态。 */
    void reset() {
        lastByOutTradeNo.clear();
        hitsByIdentity.clear();
    }

    private static void prune(Deque<Instant> hits, Instant cutoff) {
        Iterator<Instant> it = hits.iterator();
        while (it.hasNext()) {
            if (it.next().isBefore(cutoff)) {
                it.remove();
            } else {
                break;
            }
        }
    }

    private static String identityKey(String tenantId, String userCode) {
        return (tenantId == null ? "" : tenantId) + "|" + (userCode == null ? "" : userCode);
    }
}
