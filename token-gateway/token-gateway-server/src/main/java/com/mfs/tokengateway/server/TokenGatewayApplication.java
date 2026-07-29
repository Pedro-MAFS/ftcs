package com.mfs.tokengateway.server;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Token Gateway Server 入口。
 * <p>
 * G0-02 起必须配置可达的 MySQL；启动时 Flyway 迁移 {@code token_*} 表。
 */
@SpringBootApplication(scanBasePackages = {
        "com.mfs.tokengateway.server",
        "com.mfs.tokengateway.db"
})
@MapperScan("com.mfs.tokengateway.db.mapper")
@ConfigurationPropertiesScan("com.mfs.tokengateway.server.config")
public class TokenGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(TokenGatewayApplication.class, args);
    }
}
