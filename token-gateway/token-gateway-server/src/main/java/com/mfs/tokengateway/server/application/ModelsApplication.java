package com.mfs.tokengateway.server.application;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.mfs.tokengateway.db.dbservice.TokenPriceRuleDbService;
import com.mfs.tokengateway.server.api.dto.ModelsListResponse;
import com.mfs.tokengateway.server.upstream.ModelWhitelist;

/** 可调用模型列表：配置白名单 ∩ 有效价目（US-G0-17）。 */
@Service
public class ModelsApplication {

    private final ModelWhitelist modelWhitelist;
    private final TokenPriceRuleDbService tokenPriceRuleDbService;

    public ModelsApplication(
            ModelWhitelist modelWhitelist, TokenPriceRuleDbService tokenPriceRuleDbService) {
        this.modelWhitelist = modelWhitelist;
        this.tokenPriceRuleDbService = tokenPriceRuleDbService;
    }

    public ModelsListResponse listAvailable() {
        LocalDateTime asOfUtc = LocalDateTime.now(ZoneOffset.UTC);
        List<ModelsListResponse.ModelItem> items = new ArrayList<>();
        for (String model : modelWhitelist.listSorted()) {
            if (tokenPriceRuleDbService.findEffective(model, asOfUtc) == null) {
                continue;
            }
            ModelsListResponse.ModelItem item = new ModelsListResponse.ModelItem();
            item.setId(model);
            items.add(item);
        }
        ModelsListResponse body = new ModelsListResponse();
        body.setData(items);
        return body;
    }
}
