package com.mfs.tokengateway.admin.domain;

import org.springframework.http.HttpStatus;

/** Admin 业务异常（US-G6-04 / US-G6-10 共用）。 */
public class AdminApiException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public AdminApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public static AdminApiException badRequest(String code, String message) {
        return new AdminApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static AdminApiException notFound(String code, String message) {
        return new AdminApiException(HttpStatus.NOT_FOUND, code, message);
    }

    public static AdminApiException conflict(String code, String message) {
        return new AdminApiException(HttpStatus.CONFLICT, code, message);
    }
}
