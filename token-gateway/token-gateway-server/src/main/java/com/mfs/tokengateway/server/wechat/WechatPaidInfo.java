package com.mfs.tokengateway.server.wechat;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

/**
 * 微信已确认支付的信息（notify / 日后 sync 共用）。
 */
public final class WechatPaidInfo {

    private final String outTradeNo;
    private final String transactionId;
    private final int amountFen;
    private final String mchId;
    private final String appId;
    private final LocalDateTime paidAt;
    private final String source;

    public WechatPaidInfo(
            String outTradeNo,
            String transactionId,
            int amountFen,
            String mchId,
            String appId,
            LocalDateTime paidAt,
            String source) {
        this.outTradeNo = Objects.requireNonNull(outTradeNo, "outTradeNo");
        this.transactionId = Objects.requireNonNull(transactionId, "transactionId");
        this.amountFen = amountFen;
        this.mchId = mchId;
        this.appId = appId;
        this.paidAt = paidAt;
        this.source = source == null ? "unknown" : source;
    }

    public String getOutTradeNo() {
        return outTradeNo;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public int getAmountFen() {
        return amountFen;
    }

    public String getMchId() {
        return mchId;
    }

    public String getAppId() {
        return appId;
    }

    public LocalDateTime getPaidAt() {
        return paidAt;
    }

    public String getSource() {
        return source;
    }

    /** 解析微信 {@code success_time}；失败返回 null。 */
    public static LocalDateTime parsePaidAt(String successTime) {
        if (successTime == null || successTime.isBlank()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(successTime.trim()).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        } catch (Exception ignored) {
            try {
                return LocalDateTime.ofInstant(Instant.parse(successTime.trim()), ZoneOffset.UTC);
            } catch (Exception e) {
                return null;
            }
        }
    }
}
