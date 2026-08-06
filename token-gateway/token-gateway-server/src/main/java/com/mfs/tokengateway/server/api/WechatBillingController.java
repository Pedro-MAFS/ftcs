package com.mfs.tokengateway.server.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.server.api.dto.WechatOrderResponse;
import com.mfs.tokengateway.server.api.dto.WechatPrepayRequest;
import com.mfs.tokengateway.server.api.dto.WechatPrepayResponse;
import com.mfs.tokengateway.server.application.WechatPrepayApplication;
import com.mfs.tokengateway.server.security.RechargeCaller;

/**
 * 微信充值下单 / 订单查询（US-G3-01）；鉴权由 {@code RechargeTicketAuthFilter} 完成。
 */
@RestController
@RequestMapping("/v1/billing/wechat")
public class WechatBillingController {

    private final WechatPrepayApplication wechatPrepayApplication;

    public WechatBillingController(WechatPrepayApplication wechatPrepayApplication) {
        this.wechatPrepayApplication = wechatPrepayApplication;
    }

    @PostMapping("/prepay")
    public WechatPrepayResponse prepay(
            @RequestAttribute(value = RechargeCaller.REQUEST_ATTR, required = false) RechargeCaller caller,
            @RequestBody(required = false) WechatPrepayRequest body) {
        RechargeCaller c = requireCaller(caller);
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_body");
        }
        return wechatPrepayApplication.prepay(c, body.getAmountYuan());
    }

    @GetMapping("/orders/{outTradeNo}")
    public WechatOrderResponse getOrder(
            @RequestAttribute(value = RechargeCaller.REQUEST_ATTR, required = false) RechargeCaller caller,
            @PathVariable("outTradeNo") String outTradeNo) {
        return wechatPrepayApplication.getOrder(requireCaller(caller), outTradeNo);
    }

    private static RechargeCaller requireCaller(RechargeCaller caller) {
        if (caller == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_recharge_ticket");
        }
        return caller;
    }
}
