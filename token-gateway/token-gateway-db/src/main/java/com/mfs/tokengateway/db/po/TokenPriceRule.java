package com.mfs.tokengateway.db.po;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 价目版本；单价均为厘 / 百万 Token。列名含 mTok，需显式映射。 */
@Data
@TableName("token_price_rules")
public class TokenPriceRule {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String model;
    @TableField("input_price_li_per_mTok")
    private Long inputPriceLiPerMTok;
    @TableField("output_price_li_per_mTok")
    private Long outputPriceLiPerMTok;
    @TableField("upstream_input_cost_li_per_mTok")
    private Long upstreamInputCostLiPerMTok;
    @TableField("upstream_cache_cost_li_per_mTok")
    private Long upstreamCacheCostLiPerMTok;
    @TableField("upstream_output_cost_li_per_mTok")
    private Long upstreamOutputCostLiPerMTok;
    private LocalDateTime effectiveFrom;
    private LocalDateTime createdAt;
}
