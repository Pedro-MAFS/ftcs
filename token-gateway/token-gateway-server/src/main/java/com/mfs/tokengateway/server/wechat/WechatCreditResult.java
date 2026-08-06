package com.mfs.tokengateway.server.wechat;

/** 微信回调/查单驱动的订单处理结果。 */
public enum WechatCreditResult {
    /** 首次入账成功 */
    CREDITED,
    /** 订单已是 credited（幂等） */
    ALREADY_CREDITED,
    /** 本地无订单 */
    ORDER_MISSING,
    /** 入账时发现订单已关闭 */
    ORDER_CLOSED,
    /** 已关单（本次或已是 closed） */
    CLOSED,
    /** 已标 failed（支付失败类终态） */
    FAILED_MARKED,
    /** 已是终态，无需再改（如重复 CLOSED） */
    ALREADY_TERMINAL,
    /** 退款通知：已入账需人工；未入账已关单 */
    REFUND_NEEDS_MANUAL,
    /** 非终态（NOTPAY/USERPAYING 等），仅 ACK */
    IGNORED_NON_TERMINAL,
    /** 通知金额与本地不一致 */
    REJECTED_AMOUNT,
    /** mchId / appId 与配置不一致 */
    MERCHANT_MISMATCH,
    /** 必要字段缺失 */
    INVALID_PAYLOAD
}
