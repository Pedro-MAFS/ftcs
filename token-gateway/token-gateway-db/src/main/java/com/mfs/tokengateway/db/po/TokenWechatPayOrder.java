package com.mfs.tokengateway.db.po;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 微信 Native 充值订单（US-G3-01）。 */
@Data
@TableName("token_wechat_pay_orders")
public class TokenWechatPayOrder {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String outTradeNo;
    private String tenantId;
    private String userCode;
    private Long userId;
    private Integer amountFen;
    private Long amountLi;
    private String status;
    private String codeUrl;
    private String wxTransactionId;
    private String description;
    private String notifyUrl;
    private String failReason;
    private LocalDateTime paidAt;
    private LocalDateTime creditedAt;
    /** 最近一次验签成功的微信回调时间 */
    private LocalDateTime lastNotifyAt;
    /** 最近一次回调的 trade_state */
    private String lastNotifyTradeState;
    /** 最近一次本地处理结果（如 CREDITED / IGNORED_NON_TERMINAL） */
    private String lastNotifyResult;
    /** 验签成功的回调次数 */
    private Integer notifyCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
