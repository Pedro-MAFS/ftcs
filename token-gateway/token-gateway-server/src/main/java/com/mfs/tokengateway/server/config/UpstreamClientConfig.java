package com.mfs.tokengateway.server.config;

import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class UpstreamClientConfig {

    @Bean(name = "deepSeekRestClient")
    RestClient deepSeekRestClient(TokenGatewayProperties properties) {
        Duration connect = properties.getUpstream().getDeepseek().getConnectTimeout();
        Duration read = properties.getUpstream().getDeepseek().getReadTimeout();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connect);
        factory.setReadTimeout(read);
        return RestClient.builder().requestFactory(factory).build();
    }
}
