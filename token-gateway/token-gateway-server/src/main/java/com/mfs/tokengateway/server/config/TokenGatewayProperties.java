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
    private final Billing billing = new Billing();
    private final WechatPay wechatPay = new WechatPay();

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

    public Billing getBilling() {
        return billing;
    }

    public WechatPay getWechatPay() {
        return wechatPay;
    }

    public static class Upstream {
        private final DeepSeek deepseek = new DeepSeek();
        private final Tavily tavily = new Tavily();

        public DeepSeek getDeepseek() {
            return deepseek;
        }

        public Tavily getTavily() {
            return tavily;
        }
    }

    /** US-G5-01 Tavily Search 上游 */
    public static class Tavily {
        private String apiKey = "";
        private String baseUrl = "https://api.tavily.com";
        private Duration connectTimeout = Duration.ofSeconds(5);
        private Duration readTimeout = Duration.ofSeconds(60);

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

    /** US-G0-11 余额预检；US-G3-06 充值短时 ticket */
    public static class Billing {
        /** 放行条件：balance_li >= minBalanceLi；默认 1 即拒绝 <= 0 */
        private long minBalanceLi = 1L;
        /**
         * 充值短时 ticket TTL（仅影响新签发）；默认 300s。
         * 启动时校验须在 [60s, 24h]。
         */
        private Duration rechargeTicketTtl = Duration.ofSeconds(300);

        public long getMinBalanceLi() {
            return minBalanceLi;
        }

        public void setMinBalanceLi(long minBalanceLi) {
            this.minBalanceLi = minBalanceLi;
        }

        public Duration getRechargeTicketTtl() {
            return rechargeTicketTtl;
        }

        public void setRechargeTicketTtl(Duration rechargeTicketTtl) {
            this.rechargeTicketTtl = rechargeTicketTtl;
        }
    }

    /** US-G3-01 微信 Native 支付 */
    public static class WechatPay {
        private boolean enabled = false;
        private String mchId = "";
        private String appId = "";
        private String apiV3Key = "";
        private String merchantSerialNo = "";
        /** 商户私钥路径；支持绝对路径或 {@code file:} 前缀 */
        private String privateKeyPath = "";
        /**
         * 微信支付公钥路径（新商户无平台证书时必填；与 {@link #publicKeyId} 成对）。
         * 见商户平台 API 安全 → 微信支付公钥。
         */
        private String publicKeyPath = "";
        /** 微信支付公钥 ID，形如 {@code PUB_KEY_ID_...} */
        private String publicKeyId = "";
        private String notifyUrl = "";
        private String description = "官方服务预付费充值";
        private Duration codeUrlExpiresIn = Duration.ofSeconds(7200);
        /** US-G3-03 定时查单补单；实际执行还须 {@link #enabled}=true */
        private final SyncJob syncJob = new SyncJob();

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getMchId() {
            return mchId;
        }

        public void setMchId(String mchId) {
            this.mchId = mchId;
        }

        public String getAppId() {
            return appId;
        }

        public void setAppId(String appId) {
            this.appId = appId;
        }

        public String getApiV3Key() {
            return apiV3Key;
        }

        public void setApiV3Key(String apiV3Key) {
            this.apiV3Key = apiV3Key;
        }

        public String getMerchantSerialNo() {
            return merchantSerialNo;
        }

        public void setMerchantSerialNo(String merchantSerialNo) {
            this.merchantSerialNo = merchantSerialNo;
        }

        public String getPrivateKeyPath() {
            return privateKeyPath;
        }

        public void setPrivateKeyPath(String privateKeyPath) {
            this.privateKeyPath = privateKeyPath;
        }

        public String getPublicKeyPath() {
            return publicKeyPath;
        }

        public void setPublicKeyPath(String publicKeyPath) {
            this.publicKeyPath = publicKeyPath;
        }

        public String getPublicKeyId() {
            return publicKeyId;
        }

        public void setPublicKeyId(String publicKeyId) {
            this.publicKeyId = publicKeyId;
        }

        public String getNotifyUrl() {
            return notifyUrl;
        }

        public void setNotifyUrl(String notifyUrl) {
            this.notifyUrl = notifyUrl;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public Duration getCodeUrlExpiresIn() {
            return codeUrlExpiresIn;
        }

        public void setCodeUrlExpiresIn(Duration codeUrlExpiresIn) {
            this.codeUrlExpiresIn = codeUrlExpiresIn;
        }

        public SyncJob getSyncJob() {
            return syncJob;
        }

        /** 定时向微信查开放单并补入账/关单 */
        public static class SyncJob {
            private boolean enabled = true;
            private Duration fixedDelay = Duration.ofSeconds(60);
            private Duration initialDelay = Duration.ofSeconds(30);
            private int batchSize = 20;
            /** 下单后至少等待该时长再扫，给 notify / 前台轮询优先权 */
            private Duration minAge = Duration.ofMinutes(2);
            /** 只扫该窗口内创建的开放单 */
            private Duration maxAge = Duration.ofHours(48);
            /** 码过期仍 NOTPAY 时本地关单 */
            private boolean expireUnpaid = true;

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

            public Duration getMinAge() {
                return minAge;
            }

            public void setMinAge(Duration minAge) {
                this.minAge = minAge;
            }

            public Duration getMaxAge() {
                return maxAge;
            }

            public void setMaxAge(Duration maxAge) {
                this.maxAge = maxAge;
            }

            public boolean isExpireUnpaid() {
                return expireUnpaid;
            }

            public void setExpireUnpaid(boolean expireUnpaid) {
                this.expireUnpaid = expireUnpaid;
            }
        }
    }
}
