package com.mfs.tokengateway.admin.config;

import java.util.List;

import org.springframework.context.annotation.Configuration;
import org.springframework.util.CollectionUtils;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 开发期 CORS 兜底（Vite 直连 8089）。生产同域打进 jar 时通常不需要。
 */
@Configuration
public class AdminWebMvcConfig implements WebMvcConfigurer {

    private final AdminProperties adminProperties;

    public AdminWebMvcConfig(AdminProperties adminProperties) {
        this.adminProperties = adminProperties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> origins = adminProperties.getCorsAllowedOrigins();
        if (CollectionUtils.isEmpty(origins)) {
            return;
        }
        registry.addMapping("/admin/**")
                .allowedOrigins(origins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }
}
