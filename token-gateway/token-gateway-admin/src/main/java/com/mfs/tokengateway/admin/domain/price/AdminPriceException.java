package com.mfs.tokengateway.admin.domain.price;

import org.springframework.http.HttpStatus;

/** 价目管理业务异常（US-G6-10）。 */
public class AdminPriceException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public AdminPriceException(HttpStatus status, String code, String message) {
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

    public static AdminPriceException badRequest(String code, String message) {
        return new AdminPriceException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static AdminPriceException conflict(String code, String message) {
        return new AdminPriceException(HttpStatus.CONFLICT, code, message);
    }
}
