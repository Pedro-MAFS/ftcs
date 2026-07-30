package com.mfs.tokengateway.server.config;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

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

    @Bean(name = "deepSeekHttpClient")
    HttpClient deepSeekHttpClient(TokenGatewayProperties properties) {
        return HttpClient.newBuilder()
                .connectTimeout(properties.getUpstream().getDeepseek().getConnectTimeout())
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    @Bean(name = "deepSeekStreamExecutor", destroyMethod = "shutdown")
    ExecutorService deepSeekStreamExecutor(TokenGatewayProperties properties) {
        int size = Math.max(1, properties.getUpstream().getDeepseek().getStreamPoolSize());
        AtomicInteger seq = new AtomicInteger();
        ThreadFactory factory = r -> {
            Thread t = new Thread(r, "tg-stream-" + seq.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
        return new ThreadPoolExecutor(
                size,
                size,
                60L,
                TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(size * 2),
                factory,
                new ThreadPoolExecutor.AbortPolicy());
    }
}
