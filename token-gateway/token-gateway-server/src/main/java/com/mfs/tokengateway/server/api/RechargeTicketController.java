package com.mfs.tokengateway.server.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mfs.tokengateway.server.api.dto.RechargeTicketResponse;
import com.mfs.tokengateway.server.application.RechargeTicketApplication;
import com.mfs.tokengateway.server.security.UcIdentity;
import com.mfs.tokengateway.server.security.UcIdentityResolver;

/**
 * 签发充值短时 ticket（US-G3-06）。
 * <p>
 * 须 UC JWT；明文仅出现在成功响应体一次。
 */
@RestController
@RequestMapping("/v1/billing/recharge")
public class RechargeTicketController {

    private final UcIdentityResolver ucIdentityResolver;
    private final RechargeTicketApplication rechargeTicketApplication;

    public RechargeTicketController(
            UcIdentityResolver ucIdentityResolver, RechargeTicketApplication rechargeTicketApplication) {
        this.ucIdentityResolver = ucIdentityResolver;
        this.rechargeTicketApplication = rechargeTicketApplication;
    }

    @PostMapping("/ticket")
    public RechargeTicketResponse issue() {
        UcIdentity identity = ucIdentityResolver.requireCurrent();
        return rechargeTicketApplication.issue(identity);
    }
}
