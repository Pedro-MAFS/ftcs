package com.mfs.tokengateway.admin.api;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.mfs.tokengateway.admin.domain.AdminApiException;

import jakarta.servlet.http.HttpServletRequest;

/** Admin API 错误体：{@code {code, message}}（US-G6-04 / US-G6-10）。 */
@RestControllerAdvice(basePackages = "com.mfs.tokengateway.admin.api")
public class AdminRestExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(AdminRestExceptionHandler.class);

    @ExceptionHandler(AdminApiException.class)
    public ResponseEntity<Map<String, Object>> handleAdminApi(
            AdminApiException ex, HttpServletRequest request) {
        log.warn(
                "admin api error method={} path={} code={} message={}",
                request.getMethod(),
                request.getRequestURI(),
                ex.getCode(),
                ex.getMessage());
        return ResponseEntity.status(ex.getStatus()).body(errorBody(ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        String details = ex.getBindingResult().getFieldErrors().stream()
                .map(AdminRestExceptionHandler::formatField)
                .collect(Collectors.joining("; "));
        log.warn(
                "admin api validation method={} path={} details={}",
                request.getMethod(),
                request.getRequestURI(),
                details);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(errorBody("validation_error", details.isEmpty() ? "validation failed" : details));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(
            HttpMessageNotReadableException ex, HttpServletRequest request) {
        Throwable root = ex.getMostSpecificCause();
        String msg = root != null && root.getMessage() != null ? root.getMessage() : "invalid body";
        if (msg.contains("billing_unit") || msg.contains("PriceBillingUnit")) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(errorBody("validation_error", "invalid billing_unit"));
        }
        log.warn("admin api invalid body method={} path={}", request.getMethod(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(errorBody("validation_error", "invalid_body"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(
            Exception ex, HttpServletRequest request) {
        log.error(
                "admin api unexpected method={} path={}",
                request.getMethod(),
                request.getRequestURI(),
                ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorBody("internal_error", "internal_error"));
    }

    private static Map<String, Object> errorBody(String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        return body;
    }

    private static String formatField(FieldError fe) {
        return fe.getField() + ": " + fe.getDefaultMessage();
    }
}
