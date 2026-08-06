package com.mfs.tokengateway.server.application;

import java.time.Instant;

import org.springframework.stereotype.Service;

import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.api.dto.BillingPortalMeResponse;
import com.mfs.tokengateway.server.security.RechargeCaller;

/** 用户面板只读查询（US-G4-02）。 */
@Service
public class BillingPortalApplication {

    private final TokenUserDbService tokenUserDbService;

    public BillingPortalApplication(TokenUserDbService tokenUserDbService) {
        this.tokenUserDbService = tokenUserDbService;
    }

    public BillingPortalMeResponse me(RechargeCaller caller) {
        TokenUser user = resolveUser(caller);
        BillingPortalMeResponse body = new BillingPortalMeResponse();
        String code = user != null ? user.getUserCode() : caller.getUserCode();
        body.setUserCode(code);
        body.setUserCodeMasked(maskUserCode(code));
        body.setStatus(user != null && user.getStatus() != null ? user.getStatus() : "active");
        body.setBalanceLi(user != null && user.getBalanceLi() != null ? user.getBalanceLi() : 0L);
        body.setExpiresIn(caller.remainingSeconds(Instant.now()));
        return body;
    }

    private TokenUser resolveUser(RechargeCaller caller) {
        TokenUser user = null;
        if (caller.getUserId() != null) {
            user = tokenUserDbService.getById(caller.getUserId());
        }
        if (user == null) {
            user = tokenUserDbService.findByTenantIdAndUserCode(
                    caller.getTenantId(), caller.getUserCode());
        }
        return user;
    }

    static String maskUserCode(String userCode) {
        if (userCode == null || userCode.isBlank()) {
            return "—";
        }
        String raw = userCode.trim();
        if (raw.length() <= 4) {
            return "****";
        }
        if (raw.length() <= 8) {
            return raw.substring(0, 2) + "****" + raw.substring(raw.length() - 2);
        }
        return raw.substring(0, 2) + "****" + raw.substring(raw.length() - 4);
    }
}
