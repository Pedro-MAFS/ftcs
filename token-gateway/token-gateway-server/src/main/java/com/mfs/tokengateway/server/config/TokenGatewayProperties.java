package com.mfs.tokengateway.server.config;

import java.util.ArrayList;
import java.util.List;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "token-gateway")
public class TokenGatewayProperties {

    private final Upstream upstream = new Upstream();
    private final UserCenter userCenter = new UserCenter();
    private final Observability observability = new Observability();
    private final Key key = new Key();
    private final Settlement settlement = new Settlement();

    public Upstream getUpstream() {
        return upstream;
    }

    public UserCenter getUserCenter() {
        return userCenter;
    }

    public Observability getObservability() {
        return observability;
    }

    public Key getKey() {
        return key;
    }

    public Settlement getSettlement() {
        return settlement;
    }

    public static class Upstream {
        private final DeepSeek deepseek = new DeepSeek();

        public DeepSeek getDeepseek() {
            return deepseek;
        }
    }

    public static class DeepSeek {
        /** 上游 API Key，G0-03 起使用 */
        private String apiKey = "";
        private String baseUrl = "https://api.deepseek.com";
        /** 模型白名单（区分大小写） */
        private List<String> allowedModels = new ArrayList<>(List.of(
                "deepseek-v4-flash",
                "deepseek-v4-pro"));
        private Duration connectTimeout = Duration.ofSeconds(5);
        private Duration readTimeout = Duration.ofSeconds(120);
        /** 流式整段请求超时（HttpClient） */
        private Duration streamReadTimeout = Duration.ofSeconds(300);
        /** SseEmitter 超时 */
        private Duration streamEmitterTimeout = Duration.ofSeconds(300);
        /** 流式泵送线程池大小 */
        private int streamPoolSize = 64;

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public List<String> getAllowedModels() {
            return allowedModels;
        }

        public void setAllowedModels(List<String> allowedModels) {
            this.allowedModels = allowedModels;
        }

        public Duration getConnectTimeout() {
            return connectTimeout;
        }

        public void setConnectTimeout(Duration connectTimeout) {
            this.connectTimeout = connectTimeout;
        }

        public Duration getReadTimeout() {
            return readTimeout;
        }

        public void setReadTimeout(Duration readTimeout) {
            this.readTimeout = readTimeout;
        }

        public Duration getStreamReadTimeout() {
            return streamReadTimeout;
        }

        public void setStreamReadTimeout(Duration streamReadTimeout) {
            this.streamReadTimeout = streamReadTimeout;
        }

        public Duration getStreamEmitterTimeout() {
            return streamEmitterTimeout;
        }

        public void setStreamEmitterTimeout(Duration streamEmitterTimeout) {
            this.streamEmitterTimeout = streamEmitterTimeout;
        }

        public int getStreamPoolSize() {
            return streamPoolSize;
        }

        public void setStreamPoolSize(int streamPoolSize) {
            this.streamPoolSize = streamPoolSize;
        }
    }

    public static class UserCenter {
        /** Issuer，G0-05 与 RS starter 对齐 */
        private String issuerUri = "https://user.ai-utills.com";

        public String getIssuerUri() {
            return issuerUri;
        }

        public void setIssuerUri(String issuerUri) {
            this.issuerUri = issuerUri;
        }
    }

    /** US-G0-06 API Key 哈希 pepper */
    public static class Key {
        /** 与 env {@code GATEWAY_KEY_PEPPER} 对齐；空则拒绝签发 */
        private String pepper = "";

        public String getPepper() {
            return pepper;
        }

        public void setPepper(String pepper) {
            this.pepper = pepper;
        }
    }

    /** US-G0-14 可观测 */
    public static class Observability {
        private boolean accessLogEnabled = true;
        private List<String> accessLogExclude = new ArrayList<>(List.of(
                "/health",
                "/actuator/health",
                "/actuator/health/**"));

        public boolean isAccessLogEnabled() {
            return accessLogEnabled;
        }

        public void setAccessLogEnabled(boolean accessLogEnabled) {
            this.accessLogEnabled = accessLogEnabled;
        }

        public List<String> getAccessLogExclude() {
            return accessLogExclude;
        }

        public void setAccessLogExclude(List<String> accessLogExclude) {
            this.accessLogExclude = accessLogExclude;
        }
    }

    /** US-G0-10 异步结算 */
    public static class Settlement {
        private boolean enabled = true;
        private Duration fixedDelay = Duration.ofSeconds(5);
        private Duration initialDelay = Duration.ofSeconds(10);
        private int batchSize = 50;
        private Duration claimTimeout = Duration.ofMinutes(5);
        /** 空则启动时生成 UUID */
        private String instanceId = "";

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public Duration getFixedDelay() {
            return fixedDelay;
        }

        public void setFixedDelay(Duration fixedDelay) {
            this.fixedDelay = fixedDelay;
        }

        public Duration getInitialDelay() {
            return initialDelay;
        }

        public void setInitialDelay(Duration initialDelay) {
            this.initialDelay = initialDelay;
        }

        public int getBatchSize() {
            return batchSize;
        }

        public void setBatchSize(int batchSize) {
            this.batchSize = batchSize;
        }

        public Duration getClaimTimeout() {
            return claimTimeout;
        }

        public void setClaimTimeout(Duration claimTimeout) {
            this.claimTimeout = claimTimeout;
        }

        public String getInstanceId() {
            return instanceId;
        }

        public void setInstanceId(String instanceId) {
            this.instanceId = instanceId;
        }
    }
}
