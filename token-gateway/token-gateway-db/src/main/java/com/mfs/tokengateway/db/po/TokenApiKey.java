package com.mfs.tokengateway.db.po;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 用户命名 API Key；仅存 hash / prefix。 */
@Data
@TableName("token_api_keys")
public class TokenApiKey {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String name;
    private String keyHash;
    private String keyPrefix;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastUsedAt;
}
