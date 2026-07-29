package com.mfs.tokengateway.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

import com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration;

/**
 * Token Gateway Server 入口。
 * <p>
 * 默认排除 DataSource / MyBatis 自动配置，保证无 MySQL 时仍可启动探活；
 * 本地联库时使用 {@code application-local.yml} 并去掉对应 exclude（见配置示例）。
 */
@SpringBootApplication(
        scanBasePackages = "com.mfs.tokengateway.server",
        exclude = {
                DataSourceAutoConfiguration.class,
                DataSourceTransactionManagerAutoConfiguration.class,
                MybatisPlusAutoConfiguration.class
        })
@ConfigurationPropertiesScan("com.mfs.tokengateway.server.config")
public class TokenGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(TokenGatewayApplication.class, args);
    }
}
