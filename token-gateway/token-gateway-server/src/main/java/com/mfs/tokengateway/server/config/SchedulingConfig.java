package com.mfs.tokengateway.server.config;

import javax.sql.DataSource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;

/**
 * 调度 + ShedLock（US-G0-10）：多实例仅抢到锁的节点执行结算 tick。
 */
@Configuration
@EnableScheduling
@EnableSchedulerLock(defaultLockAtMostFor = "10m")
public class SchedulingConfig {

    public static final String SETTLEMENT_LOCK_NAME = "tokenGatewaySettlement";

    /** US-G3-03 微信查单补单调度 */
    public static final String WECHAT_PAY_SYNC_LOCK_NAME = "wechatPaySyncJob";

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(new JdbcTemplate(dataSource))
                        .withTableName("token_shedlock")
                        .usingDbTime()
                        .build());
    }
}
