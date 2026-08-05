package com.mfs.tokengateway.db.po;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 充值短时 ticket；仅存 hash。 */
@Data
@TableName("token_recharge_tickets")
public class TokenRechargeTicket {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String ticketHash;
    private String tenantId;
    private String userCode;
    private Long userId;
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;
    private LocalDateTime lastUsedAt;
    private LocalDateTime revokedAt;
}
