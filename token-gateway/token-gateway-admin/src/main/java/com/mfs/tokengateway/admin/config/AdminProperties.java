package com.mfs.tokengateway.admin.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 管理端配置（US-G6-01）。
 */
@ConfigurationProperties(prefix = "token-gateway.admin")
public class AdminProperties {

    /**
     * 允许跨域的前端 Origin（开发 Vite 等）。生产同域 jar 托管时可留空。
     */
    private List<String> corsAllowedOrigins = new ArrayList<>();

    public List<String> getCorsAllowedOrigins() {
        return corsAllowedOrigins;
    }

    public void setCorsAllowedOrigins(List<String> corsAllowedOrigins) {
        this.corsAllowedOrigins = corsAllowedOrigins != null ? corsAllowedOrigins : new ArrayList<>();
    }
}
