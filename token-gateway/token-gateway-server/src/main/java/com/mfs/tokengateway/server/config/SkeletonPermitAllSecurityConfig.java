package com.mfs.tokengateway.server.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 仅当类路径上<strong>没有</strong> RS JWT 配置类时全放行（应急兜底）。
 * <p>
 * 正常构建已默认依赖 {@code embed-oauth-resource-starter}，本 Bean 不会加载；
 * 安全链由 Starter 提供。
 */
@Configuration
@ConditionalOnMissingClass("com.mfs.oauth.rs.service.base.config.webmvc.OAuthResourceJwtConfiguration")
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
