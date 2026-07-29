package com.mfs.tokengateway.db.po;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 网关计费账户；余额单位为厘（CNY li）。 */
@Data
@TableName("token_users")
public class TokenUser {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String tenantId;
    private String userCode;
    /** 余额（厘），禁止用浮点类型 */
    private Long balanceLi;
    private String status;
    private Integer rpmLimit;
    private Integer tpmLimit;
    private Long dailyLimitLi;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
