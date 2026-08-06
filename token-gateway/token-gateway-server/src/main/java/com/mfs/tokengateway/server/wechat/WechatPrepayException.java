package com.mfs.tokengateway.server.wechat;

/** 调微信 Native 预下单失败（映射 HTTP 502 {@code wechat_prepay_failed}）。 */
public class WechatPrepayException extends RuntimeException {

    private final String shortCode;

    public WechatPrepayException(String shortCode) {
        super(shortCode);
        this.shortCode = shortCode == null ? "unknown" : shortCode;
    }

    public WechatPrepayException(String shortCode, Throwable cause) {
        super(shortCode, cause);
        this.shortCode = shortCode == null ? "unknown" : shortCode;
    }

    public String getShortCode() {
        return shortCode;
    }
}
