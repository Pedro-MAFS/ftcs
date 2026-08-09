package com.mfs.tokengateway.admin.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.admin.api.dto.AdminWechatOrderListResponse;
import com.mfs.tokengateway.admin.application.AdminWechatOrderApplication;

/** 微信充值订单只读 API（US-G6-11）。 */
@RestController
@RequestMapping("/admin/v1")
public class AdminWechatOrderController {

    private final AdminWechatOrderApplication adminWechatOrderApplication;

    public AdminWechatOrderController(AdminWechatOrderApplication adminWechatOrderApplication) {
        this.adminWechatOrderApplication = adminWechatOrderApplication;
    }

    @GetMapping("/wechat-orders")
    public AdminWechatOrderListResponse listOrders(
            @RequestParam(value = "user_id", required = false) Long userId,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "out_trade_no", required = false) String outTradeNo,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return adminWechatOrderApplication.listOrders(
                userId, status, outTradeNo, from, to, page, size);
    }
}
