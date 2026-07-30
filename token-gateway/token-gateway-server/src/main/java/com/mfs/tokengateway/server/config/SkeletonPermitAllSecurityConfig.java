package com.mfs.tokengateway.server.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 未引入 RS Starter（未加 {@code -Puc-rs}）时全放行，避免 Boot 默认安全挡住探活。
 * <p>
 * 正式联调请 {@code -Puc-rs}：类路径出现 RS JWT 配置类后本 Bean 不加载，安全链完全由 Starter 提供。
 */
@Configuration
@ConditionalOnMissingClass("com.mfs.oauth.rs.service.config.OAuthResourceJwtConfiguration")
public class SkeletonPermitAllSecurityConfig {

    @Bean
    SecurityFilterChain skeletonPermitAllSecurityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
