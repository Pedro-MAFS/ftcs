package com.mfs.tokengateway.server.upstream;

import org.springframework.http.HttpStatus;

/**
 * 上游调用失败（已映射为对客户端安全的状态与短码）。
 */
public class UpstreamException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public UpstreamException(HttpStatus status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public static UpstreamException notConfigured() {
        return new UpstreamException(HttpStatus.SERVICE_UNAVAILABLE, "upstream_not_configured");
    }

    public static UpstreamException timeout() {
        return new UpstreamException(HttpStatus.GATEWAY_TIMEOUT, "upstream_timeout");
    }

    public static UpstreamException unreachable() {
        return new UpstreamException(HttpStatus.BAD_GATEWAY, "upstream_unreachable");
    }

    public static UpstreamException error() {
        return new UpstreamException(HttpStatus.BAD_GATEWAY, "upstream_error");
    }

    public static UpstreamException invalidResponse() {
        return new UpstreamException(HttpStatus.BAD_GATEWAY, "upstream_invalid_response");
    }
}
