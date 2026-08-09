package com.mfs.tokengateway.admin.domain.price;

import org.springframework.http.HttpStatus;

import com.mfs.tokengateway.admin.domain.AdminApiException;

/** 价目管理业务异常（US-G6-10）；继承公共 {@link AdminApiException}。 */
public class AdminPriceException extends AdminApiException {

    public AdminPriceException(HttpStatus status, String code, String message) {
        super(status, code, message);
    }

    public static AdminPriceException badRequest(String code, String message) {
        return new AdminPriceException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static AdminPriceException conflict(String code, String message) {
        return new AdminPriceException(HttpStatus.CONFLICT, code, message);
    }
}
