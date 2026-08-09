package com.mfs.tokengateway.admin;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Token Gateway Admin 入口（US-G6-01）。
 * <p>
 * 独立进程，默认端口 8089；连接与 server 同一套 {@code token_*} 库。
 * Flyway 由 server 执行，本进程默认关闭迁移。
 */
@SpringBootApplication(scanBasePackages = {
        "com.mfs.tokengateway.admin",
        "com.mfs.tokengateway.db"
})
@MapperScan("com.mfs.tokengateway.db.mapper")
@ConfigurationPropertiesScan("com.mfs.tokengateway.admin.config")
public class TokenGatewayAdminApplication {

    public static void main(String[] args) {
        SpringApplication.run(TokenGatewayAdminApplication.class, args);
    }
}
