package com.mfs.tokengateway.server.application;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.api.dto.UsageMeResponse;
import com.mfs.tokengateway.server.security.ChatCaller;

/** 当前用户余额查询（US-G0-16）。 */
@Service
public class UsageMeApplication {

    private final TokenUserDbService tokenUserDbService;
    private final TokenApiKeyDbService tokenApiKeyDbService;

    public UsageMeApplication(
            TokenUserDbService tokenUserDbService, TokenApiKeyDbService tokenApiKeyDbService) {
        this.tokenUserDbService = tokenUserDbService;
        this.tokenApiKeyDbService = tokenApiKeyDbService;
    }

    public UsageMeResponse getMe(ChatCaller caller) {
        TokenUser user = tokenUserDbService.getById(caller.getUserId());
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_api_key");
        }
        TokenApiKey key = tokenApiKeyDbService.getById(caller.getKeyId());
        if (key == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_api_key");
        }

        UsageMeResponse.KeyView keyView = new UsageMeResponse.KeyView();
        keyView.setName(key.getName());
        keyView.setPrefix(key.getKeyPrefix());

        UsageMeResponse body = new UsageMeResponse();
        body.setUserId(user.getId());
        body.setTenantId(user.getTenantId());
        body.setUserCode(user.getUserCode());
        body.setBalanceLi(user.getBalanceLi() == null ? 0L : user.getBalanceLi());
        body.setKey(keyView);
        return body;
    }
}
