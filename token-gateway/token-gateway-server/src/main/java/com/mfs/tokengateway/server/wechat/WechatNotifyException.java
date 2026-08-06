package com.mfs.tokengateway.server.wechat;

/** 通知验签/解密失败。 */
public class WechatNotifyException extends RuntimeException {

    private final String shortCode;

    public WechatNotifyException(String shortCode, Throwable cause) {
        super(shortCode, cause);
        this.shortCode = shortCode == null ? "notify_invalid" : shortCode;
    }

    public WechatNotifyException(String shortCode) {
        super(shortCode);
        this.shortCode = shortCode == null ? "notify_invalid" : shortCode;
    }

    public String getShortCode() {
        return shortCode;
    }
}
