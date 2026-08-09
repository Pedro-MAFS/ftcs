package com.mfs.tokengateway.admin.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AdminClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
