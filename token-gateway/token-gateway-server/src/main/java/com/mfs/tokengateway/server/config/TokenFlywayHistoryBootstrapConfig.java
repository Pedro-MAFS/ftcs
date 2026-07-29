package com.mfs.tokengateway.server.config;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

/**
 * 允许与其它业务共库（表名已有 {@code token_} 前缀）。
 * <p>
 * TiDB / 非空 schema：Flyway 自带 {@code baseline-on-migrate} 会执行
 * {@code CREATE TABLE ... SELECT}（TiDB 不支持）。此处用普通 DDL 预建
 * {@code token_flyway_schema_history}，并在空表时写入 baseline=0，再交给 Flyway migrate。
 */
@Configuration
@ConditionalOnProperty(prefix = "spring.flyway", name = "enabled", havingValue = "true", matchIfMissing = true)
public class TokenFlywayHistoryBootstrapConfig {

    public static final String HISTORY_TABLE = "token_flyway_schema_history";
    public static final String BEAN_NAME = "tokenFlywayHistoryBootstrap";

    private static final Logger log = LoggerFactory.getLogger(TokenFlywayHistoryBootstrapConfig.class);

    @Bean
    static BeanFactoryPostProcessor tokenFlywayInitializerDependsOnBootstrap() {
        return beanFactory -> {
            if (beanFactory.containsBeanDefinition("flywayInitializer")) {
                beanFactory.getBeanDefinition("flywayInitializer").setDependsOn(BEAN_NAME);
            }
        };
    }

    @Bean(name = BEAN_NAME)
    @Order(Ordered.HIGHEST_PRECEDENCE)
    InitializingDataSourceBootstrap tokenFlywayHistoryBootstrap(DataSource dataSource) {
        return new InitializingDataSourceBootstrap(dataSource);
    }

    static final class InitializingDataSourceBootstrap
            implements org.springframework.beans.factory.InitializingBean {

        private final DataSource dataSource;

        InitializingDataSourceBootstrap(DataSource dataSource) {
            this.dataSource = dataSource;
        }

        @Override
        public void afterPropertiesSet() throws Exception {
            try (Connection conn = dataSource.getConnection(); Statement st = conn.createStatement()) {
                st.execute("""
                        CREATE TABLE IF NOT EXISTS token_flyway_schema_history (
                          installed_rank INT NOT NULL,
                          version VARCHAR(50),
                          description VARCHAR(200) NOT NULL,
                          type VARCHAR(20) NOT NULL,
                          script VARCHAR(1000) NOT NULL,
                          checksum INT,
                          installed_by VARCHAR(100) NOT NULL,
                          installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                          execution_time INT NOT NULL,
                          success TINYINT(1) NOT NULL,
                          PRIMARY KEY (installed_rank)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
                        """);
                boolean empty;
                try (ResultSet rs = st.executeQuery(
                        "SELECT COUNT(1) FROM token_flyway_schema_history")) {
                    rs.next();
                    empty = rs.getInt(1) == 0;
                }
                if (empty) {
                    st.executeUpdate("""
                            INSERT INTO token_flyway_schema_history (
                              installed_rank, version, description, type, script,
                              checksum, installed_by, execution_time, success
                            ) VALUES (
                              1, '0', '<< Flyway Baseline >>', 'BASELINE', '<< Flyway Baseline >>',
                              NULL, 'token-gateway', 0, 1
                            )
                            """);
                    log.info("Initialized {} with baseline version 0 (shared-schema / TiDB safe)", HISTORY_TABLE);
                }
            }
        }
    }
}
