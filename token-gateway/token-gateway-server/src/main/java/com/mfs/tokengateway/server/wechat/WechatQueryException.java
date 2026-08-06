package com.mfs.tokengateway.server.wechat;

/** 调微信查单失败（映射 HTTP 502 {@code wechat_query_failed}）。 */
public class WechatQueryException extends RuntimeException {

    private final String shortCode;

    public WechatQueryException(String shortCode) {
        super(shortCode);
        this.shortCode = shortCode == null ? "unknown" : shortCode;
    }

    public WechatQueryException(String shortCode, Throwable cause) {
        super(shortCode, cause);
        this.shortCode = shortCode == null ? "unknown" : shortCode;
    }

    public String getShortCode() {
        return shortCode;
    }
}
