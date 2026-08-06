package com.mfs.tokengateway.server.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.server.api.dto.BillingPortalMeResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalTopupsResponse;
import com.mfs.tokengateway.server.api.dto.BillingPortalUsageResponse;
import com.mfs.tokengateway.server.application.BillingPortalApplication;
import com.mfs.tokengateway.server.security.RechargeCaller;

/**
 * 用户面板 JSON API（US-G4）；鉴权由 {@code RechargeTicketAuthFilter} 完成。
 */
@RestController
@RequestMapping("/v1/billing/portal")
public class BillingPortalController {

    private final BillingPortalApplication billingPortalApplication;

    public BillingPortalController(BillingPortalApplication billingPortalApplication) {
        this.billingPortalApplication = billingPortalApplication;
    }

    @GetMapping("/me")
    public BillingPortalMeResponse me(
            @RequestAttribute(value = RechargeCaller.REQUEST_ATTR, required = false) RechargeCaller caller) {
        return billingPortalApplication.me(requireCaller(caller));
    }

    @GetMapping("/usage")
    public BillingPortalUsageResponse usage(
            @RequestAttribute(value = RechargeCaller.REQUEST_ATTR, required = false) RechargeCaller caller,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to,
            @RequestParam(value = "cursor", required = false) String cursor) {
        return billingPortalApplication.listUsage(requireCaller(caller), limit, from, to, cursor);
    }

    @GetMapping("/topups")
    public BillingPortalTopupsResponse topups(
            @RequestAttribute(value = RechargeCaller.REQUEST_ATTR, required = false) RechargeCaller caller,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to,
            @RequestParam(value = "cursor", required = false) String cursor) {
        return billingPortalApplication.listTopups(requireCaller(caller), limit, from, to, cursor);
    }

    private static RechargeCaller requireCaller(RechargeCaller caller) {
        if (caller == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_recharge_ticket");
        }
        return caller;
    }
}
