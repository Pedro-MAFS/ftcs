package com.mfs.tokengateway.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "token-gateway")
public class TokenGatewayProperties {

    private final Upstream upstream = new Upstream();
    private final UserCenter userCenter = new UserCenter();

    public Upstream getUpstream() {
        return upstream;
    }

    public UserCenter getUserCenter() {
        return userCenter;
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
}
