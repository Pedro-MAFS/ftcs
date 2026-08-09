package com.mfs.tokengateway.admin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 与 server 对齐的 API Key pepper（US-G6-05）。
 * <p>
 * 配置键：{@code token-gateway.key.pepper} ← 环境变量 {@code GATEWAY_KEY_PEPPER}。
 */
@ConfigurationProperties(prefix = "token-gateway.key")
public class GatewayKeyProperties {

    private String pepper = "";

    public String getPepper() {
        return pepper;
    }

    public void setPepper(String pepper) {
        this.pepper = pepper != null ? pepper : "";
    }
}
