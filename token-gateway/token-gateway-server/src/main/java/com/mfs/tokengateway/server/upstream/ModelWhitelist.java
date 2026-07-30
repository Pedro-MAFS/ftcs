package com.mfs.tokengateway.server.upstream;

import java.util.HashSet;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.mfs.tokengateway.server.config.TokenGatewayProperties;

/** DeepSeek 模型白名单（US-G0-03）；区分大小写，不读库。 */
@Component
public class ModelWhitelist {

    private final Set<String> allowed;

    public ModelWhitelist(TokenGatewayProperties properties) {
        this.allowed = new HashSet<>(properties.getUpstream().getDeepseek().getAllowedModels());
    }

    /** 测试 / 自定义构造。 */
    public ModelWhitelist(Set<String> allowed) {
        this.allowed = Set.copyOf(allowed);
    }

    public boolean isAllowed(String model) {
        return model != null && allowed.contains(model);
    }
}
