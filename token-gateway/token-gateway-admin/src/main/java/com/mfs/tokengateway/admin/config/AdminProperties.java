package com.mfs.tokengateway.admin.config;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 管理端配置（US-G6-01 / US-G6-10）。
 */
@ConfigurationProperties(prefix = "token-gateway.admin")
public class AdminProperties {

    /**
     * 允许跨域的前端 Origin（开发 Vite 等）。生产同域 jar 托管时可留空。
     */
    private List<String> corsAllowedOrigins = new ArrayList<>();

    /** 价目管理（US-G6-10）。 */
    private Prices prices = new Prices();

    public List<String> getCorsAllowedOrigins() {
        return corsAllowedOrigins;
    }

    public void setCorsAllowedOrigins(List<String> corsAllowedOrigins) {
        this.corsAllowedOrigins = corsAllowedOrigins != null ? corsAllowedOrigins : new ArrayList<>();
    }

    public Prices getPrices() {
        return prices;
    }

    public void setPrices(Prices prices) {
        this.prices = prices != null ? prices : new Prices();
    }

    /** 价目允许的 model 集合（只读快照）。 */
    public Set<String> allowedPriceModels() {
        return new LinkedHashSet<>(prices.getAllowedModels());
    }

    public static class Prices {

        /**
         * 允许调价 / 展示的 model 白名单。默认 flash / pro / tavily.search。
         */
        private List<String> allowedModels = new ArrayList<>(List.of(
                "deepseek-v4-flash",
                "deepseek-v4-pro",
                "tavily.search"));

        public List<String> getAllowedModels() {
            return allowedModels;
        }

        public void setAllowedModels(List<String> allowedModels) {
            this.allowedModels = allowedModels != null && !allowedModels.isEmpty()
                    ? new ArrayList<>(allowedModels)
                    : new ArrayList<>(List.of(
                            "deepseek-v4-flash",
                            "deepseek-v4-pro",
                            "tavily.search"));
        }
    }
}
