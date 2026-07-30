package com.mfs.tokengateway.server.settlement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.mfs.tokengateway.server.config.SchedulingConfig;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * US-G0-10：各实例均可注册调度；**ShedLock** 保证同时仅一方执行。
 * {@code settling} 状态仅用于批内观测与崩溃回收，不作调度互斥。
 */
@Component
@ConditionalOnProperty(
        prefix = "token-gateway.settlement",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class SettlementScheduler {

    private static final Logger log = LoggerFactory.getLogger(SettlementScheduler.class);

    private final SettlementApplication settlementApplication;

    public SettlementScheduler(
            SettlementApplication settlementApplication, TokenGatewayProperties properties) {
        this.settlementApplication = settlementApplication;
        log.info(
                "settlement scheduler enabled instanceId={} batchSize={} (ShedLock={})",
                settlementApplication.getInstanceId(),
                properties.getSettlement().getBatchSize(),
                SchedulingConfig.SETTLEMENT_LOCK_NAME);
    }

    @Scheduled(
            fixedDelayString = "${token-gateway.settlement.fixed-delay:5s}",
            initialDelayString = "${token-gateway.settlement.initial-delay:10s}")
    @SchedulerLock(
            name = SchedulingConfig.SETTLEMENT_LOCK_NAME,
            lockAtLeastFor = "4s",
            lockAtMostFor = "10m")
    public void tick() {
        try {
            settlementApplication.settleBatch();
        } catch (RuntimeException e) {
            log.warn("settlement tick failed: {}", e.toString());
        }
    }
}
