package com.mfs.tokengateway.server.wechat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.wechat.pay.java.core.Config;
import com.wechat.pay.java.core.RSAPublicKeyConfig;
import com.wechat.pay.java.core.exception.HttpException;
import com.wechat.pay.java.core.exception.MalformedMessageException;
import com.wechat.pay.java.core.exception.ServiceException;
import com.wechat.pay.java.core.exception.ValidationException;
import com.wechat.pay.java.service.payments.nativepay.NativePayService;
import com.wechat.pay.java.service.payments.nativepay.model.Amount;
import com.wechat.pay.java.service.payments.nativepay.model.PrepayRequest;
import com.wechat.pay.java.service.payments.nativepay.model.PrepayResponse;

import jakarta.annotation.PostConstruct;

/**
 * 官方 SDK 薄封装：微信 Native 预下单（US-G3-01）。
 * <p>
 * 新商户无平台证书时使用 {@link RSAPublicKeyConfig}（微信支付公钥），
 * 不再自动拉取 {@code /v3/certificates}。
 */
@Component
public class WechatPayClient {

    private static final Logger log = LoggerFactory.getLogger(WechatPayClient.class);

    private final TokenGatewayProperties properties;

    private volatile NativePayService nativePayService;

    public WechatPayClient(TokenGatewayProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void init() {
        TokenGatewayProperties.WechatPay cfg = properties.getWechatPay();
        if (!cfg.isEnabled()) {
            log.info("wechat pay disabled (token-gateway.wechat-pay.enabled=false)");
            return;
        }
        requireConfigured(cfg);
        Path privateKeyPath = resolvePath(cfg.getPrivateKeyPath());
        Path publicKeyPath = resolvePath(cfg.getPublicKeyPath());
        if (!Files.isRegularFile(privateKeyPath)) {
            throw new IllegalStateException(
                    "wechat pay private key file not found: " + privateKeyPath.toAbsolutePath());
        }
        if (!Files.isRegularFile(publicKeyPath)) {
            throw new IllegalStateException(
                    "wechat pay public key file not found: " + publicKeyPath.toAbsolutePath());
        }
        Config config =
                new RSAPublicKeyConfig.Builder()
                        .merchantId(cfg.getMchId().trim())
                        .privateKeyFromPath(privateKeyPath.toAbsolutePath().toString())
                        .merchantSerialNumber(cfg.getMerchantSerialNo().trim())
                        .publicKeyFromPath(publicKeyPath.toAbsolutePath().toString())
                        .publicKeyId(cfg.getPublicKeyId().trim())
                        .apiV3Key(cfg.getApiV3Key().trim())
                        .build();
        this.nativePayService = new NativePayService.Builder().config(config).build();
        log.info(
                "wechat pay client ready mode=publicKey mchId={} appId={} publicKeyId={}",
                cfg.getMchId().trim(),
                cfg.getAppId().trim(),
                cfg.getPublicKeyId().trim());
    }

    public boolean isAvailable() {
        TokenGatewayProperties.WechatPay cfg = properties.getWechatPay();
        return cfg.isEnabled() && nativePayService != null && isConfigured(cfg);
    }

    /**
     * Native 预下单，返回 {@code code_url}。
     *
     * @throws WechatPrepayException 微信侧失败
     */
    public String createNativeCodeUrl(String outTradeNo, int amountFen, String description, String notifyUrl) {
        TokenGatewayProperties.WechatPay cfg = properties.getWechatPay();
        NativePayService service = nativePayService;
        if (!cfg.isEnabled() || service == null) {
            throw new IllegalStateException("wechat pay not available");
        }

        PrepayRequest request = new PrepayRequest();
        request.setAppid(cfg.getAppId().trim());
        request.setMchid(cfg.getMchId().trim());
        request.setDescription(description);
        request.setOutTradeNo(outTradeNo);
        request.setNotifyUrl(notifyUrl);
        Amount amount = new Amount();
        amount.setTotal(amountFen);
        amount.setCurrency("CNY");
        request.setAmount(amount);

        try {
            PrepayResponse response = service.prepay(request);
            String codeUrl = response == null ? null : response.getCodeUrl();
            if (codeUrl == null || codeUrl.isBlank()) {
                log.warn("wechat native prepay empty code_url outTradeNo={}", outTradeNo);
                throw new WechatPrepayException("empty_code_url");
            }
            return codeUrl;
        } catch (ServiceException e) {
            log.warn(
                    "wechat native prepay service error outTradeNo={} http={} code={} msg={}",
                    outTradeNo,
                    e.getHttpStatusCode(),
                    e.getErrorCode(),
                    e.getErrorMessage());
            throw new WechatPrepayException(e.getErrorCode(), e);
        } catch (HttpException | MalformedMessageException | ValidationException e) {
            log.warn("wechat native prepay transport error outTradeNo={}", outTradeNo, e);
            throw new WechatPrepayException(e.getClass().getSimpleName(), e);
        }
    }

    static void requireConfigured(TokenGatewayProperties.WechatPay cfg) {
        if (!isConfigured(cfg)) {
            throw new IllegalStateException(
                    "token-gateway.wechat-pay.enabled=true but mch-id/app-id/api-v3-key/"
                            + "merchant-serial-no/private-key-path/public-key-path/public-key-id/"
                            + "notify-url is blank");
        }
    }

    static boolean isConfigured(TokenGatewayProperties.WechatPay cfg) {
        return notBlank(cfg.getMchId())
                && notBlank(cfg.getAppId())
                && notBlank(cfg.getApiV3Key())
                && notBlank(cfg.getMerchantSerialNo())
                && notBlank(cfg.getPrivateKeyPath())
                && notBlank(cfg.getPublicKeyPath())
                && notBlank(cfg.getPublicKeyId())
                && notBlank(cfg.getNotifyUrl());
    }

    static Path resolvePath(String configured) {
        Objects.requireNonNull(configured, "path");
        String path = configured.trim();
        if (path.startsWith("file:")) {
            path = path.substring("file:".length());
            if (path.startsWith("//")) {
                path = path.replaceFirst("^//+", "");
                if (path.regionMatches(true, 0, "localhost/", 0, "localhost/".length())) {
                    path = path.substring("localhost/".length());
                }
            }
        }
        return Path.of(path);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
