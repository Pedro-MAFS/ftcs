/**
 * 管理端后端占位模块（本期不实现业务）。
 *
 * <p>规划：独立进程，依赖 {@code token-gateway-db}，提供充值/禁用 Key/调价/流水查询等运维 API；
 * 改余额或状态必须写流水。鉴权与消费方 {@code sk-} / UC JWT 分离。
 *
 * <p>上线前运维直接改库，且必须写流水。前端见 {@code tokengateway-admin-ui}。
 */
package com.mfs.tokengateway.admin;
