package com.mfs.tokengateway.db.po;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 账本流水；amountLi 充正扣负。 */
@Data
@TableName("token_ledger_entries")
public class TokenLedgerEntry {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String type;
    private Long amountLi;
    private Long balanceAfterLi;
    private String requestId;
    private String note;
    private String operator;
    private LocalDateTime createdAt;
}
