/**
 * Token Gateway 运维管理端（US-G6-01 起可独立启动）。
 *
 * <p>独立进程（默认 8089），依赖 {@code token-gateway-db}，与 server 共库。
 * 内网部署；本期无管理登录。生产可将 {@code tokengateway-admin-ui} 的 dist
 * 打进 {@code classpath:/static/}，由内嵌 Tomcat 同域暴露。
 *
 * <p>禁止依赖 {@code token-gateway-server}；勿引入消费方 sk / UC RS 鉴权链。
 */
package com.mfs.tokengateway.admin;
