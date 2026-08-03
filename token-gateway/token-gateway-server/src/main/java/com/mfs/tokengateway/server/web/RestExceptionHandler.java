package com.mfs.tokengateway.server.web;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 业务接口异常统一日志与响应体（不含 RS Filter 层鉴权失败）。
 * <p>
 * 响应体约定：{@code {"reason":"..."}}，与桌面端 / 现有 reason 短码一致。
 */
@RestControllerAdvice(basePackages = "com.mfs.tokengateway.server.api")
public class RestExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(RestExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatus(
            ResponseStatusException ex, HttpServletRequest request) {
        HttpStatusCode status = ex.getStatusCode();
        String reason = ex.getReason() != null ? ex.getReason() : String.valueOf(status.value());
        if (status.is5xxServerError()) {
            log.error(
                    "api error method={} path={} status={} reason={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    status.value(),
                    reason,
                    ex);
        } else {
            log.warn(
                    "api error method={} path={} status={} reason={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    status.value(),
                    reason);
        }
        return ResponseEntity.status(status).body(Map.of("reason", reason));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(
            Exception ex, HttpServletRequest request) {
        log.error(
                "api unexpected method={} path={}",
                request.getMethod(),
                request.getRequestURI(),
                ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("reason", "internal_error"));
    }
}
