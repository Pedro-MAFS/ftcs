package com.mfs.tokengateway.server.wechat;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.mfs.tokengateway.server.application.WechatPaySyncJobApplication;
import com.mfs.tokengateway.server.config.SchedulingConfig;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

/**
 * US-G3-03：定时查单补单；ShedLock 多实例互斥。
 * <p>
 * 组件在 {@code sync-job.enabled=true}（默认）时注册；tick 内再检查 {@code wechat-pay.enabled}。
 */
@Component
@ConditionalOnProperty(
        prefix = "token-gateway.wechat-pay.sync-job",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class WechatPaySyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(WechatPaySyncScheduler.class);

    private final WechatPaySyncJobApplication jobApplication;
    private final TokenGatewayProperties properties;

    public WechatPaySyncScheduler(
            WechatPaySyncJobApplication jobApplication, TokenGatewayProperties properties) {
        this.jobApplication = jobApplication;
        this.properties = properties;
        log.info(
                "wechat pay sync scheduler registered batchSize={} minAge={} (ShedLock={})",
                properties.getWechatPay().getSyncJob().getBatchSize(),
                properties.getWechatPay().getSyncJob().getMinAge(),
                SchedulingConfig.WECHAT_PAY_SYNC_LOCK_NAME);
    }

    @Scheduled(
            fixedDelayString = "${token-gateway.wechat-pay.sync-job.fixed-delay:60s}",
            initialDelayString = "${token-gateway.wechat-pay.sync-job.initial-delay:30s}")
    @SchedulerLock(
            name = SchedulingConfig.WECHAT_PAY_SYNC_LOCK_NAME,
            lockAtLeastFor = "30s",
            lockAtMostFor = "10m")
    public void tick() {
        if (!properties.getWechatPay().isEnabled()) {
            return;
        }
        try {
            int n = jobApplication.syncBatch();
            if (n > 0) {
                log.info("wechat pay sync tick handled={}", n);
            }
        } catch (RuntimeException e) {
            log.warn("wechat pay sync tick failed: {}", e.toString());
        }
    }
}
