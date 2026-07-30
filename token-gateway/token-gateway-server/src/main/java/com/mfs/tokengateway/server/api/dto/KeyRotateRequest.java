package com.mfs.tokengateway.server.api.dto;

/**
 * {@code POST /v1/keys/rotate} 请求体。
 */
public class KeyRotateRequest {

    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
