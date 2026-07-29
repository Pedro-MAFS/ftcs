package com.mfs.tokengateway.db.po;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 请求计量日志；金额字段均为厘。 */
@Data
@TableName("token_request_logs")
public class TokenRequestLog {

    @TableId(type = IdType.INPUT)
    private String requestId;
    private Long userId;
    private Long keyId;
    private String keyName;
    private String model;
    private String status;
    private Integer promptTokens;
    private Integer completionTokens;
    private Integer cachedTokens;
    private Integer uncachedTokens;
    private Long revenueLi;
    private Long cogsLi;
    private Long marginLi;
    private Integer latencyMs;
    private Integer upstreamStatus;
    private String errorSummary;
    private String billingStatus;
    private LocalDateTime createdAt;
}
