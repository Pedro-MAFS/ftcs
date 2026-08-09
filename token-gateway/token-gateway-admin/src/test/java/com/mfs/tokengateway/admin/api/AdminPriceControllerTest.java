package com.mfs.tokengateway.admin.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.mfs.tokengateway.admin.api.dto.AdminPriceListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminPriceListResponse.AdminPriceItem;
import com.mfs.tokengateway.admin.application.AdminPriceApplication;
import com.mfs.tokengateway.admin.domain.price.AdminPriceException;

@ExtendWith(MockitoExtension.class)
class AdminPriceControllerTest {

    @Mock
    private AdminPriceApplication adminPriceApplication;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new AdminPriceController(adminPriceApplication))
                .setControllerAdvice(new AdminRestExceptionHandler())
                .build();
    }

    @Test
    void listOk() throws Exception {
        AdminPriceListResponse resp = new AdminPriceListResponse();
        resp.setAsOf(Instant.parse("2026-08-01T00:00:00Z"));
        AdminPriceItem item = new AdminPriceItem();
        item.setId(1L);
        item.setModel("deepseek-v4-flash");
        item.setBillingUnit("per_mtok");
        item.setStatus("current");
        item.setInputPriceLiPerMtok(1200L);
        resp.setItems(List.of(item));
        when(adminPriceApplication.list(isNull(), anyBoolean(), anyBoolean(), any())).thenReturn(resp);

        mockMvc.perform(get("/admin/v1/prices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].model").value("deepseek-v4-flash"))
                .andExpect(jsonPath("$.items[0].input_price_li_per_mtok").value(1200));
    }

    @Test
    void timelineSupportsDottedModel() throws Exception {
        AdminPriceListResponse resp = new AdminPriceListResponse();
        resp.setAsOf(Instant.parse("2026-08-01T00:00:00Z"));
        resp.setItems(List.of());
        when(adminPriceApplication.timeline(anyString(), any())).thenReturn(resp);

        mockMvc.perform(get("/admin/v1/prices/tavily.search"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }

    @Test
    void createReturns201() throws Exception {
        AdminPriceItem item = new AdminPriceItem();
        item.setId(21L);
        item.setModel("tavily.search");
        item.setBillingUnit("per_call");
        item.setStatus("scheduled");
        item.setPriceLiPerCall(100L);
        when(adminPriceApplication.create(any(), anyString())).thenReturn(item);

        String body = """
                {
                  "model": "tavily.search",
                  "billing_unit": "per_call",
                  "effective_from": "2026-09-01T00:00:00.000Z",
                  "operator": "lisi",
                  "note": "upstream",
                  "price_li_per_call": 100,
                  "cogs_li_per_call": 60
                }
                """;

        mockMvc.perform(post("/admin/v1/prices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(21))
                .andExpect(jsonPath("$.billing_unit").value("per_call"));
    }

    @Test
    void createMapsBusinessError() throws Exception {
        when(adminPriceApplication.create(any(), anyString()))
                .thenThrow(AdminPriceException.badRequest("billing_unit_mismatch", "bad unit"));

        String body = """
                {
                  "model": "tavily.search",
                  "billing_unit": "per_mtok",
                  "effective_from": "2026-09-01T00:00:00.000Z",
                  "operator": "lisi",
                  "note": "x",
                  "input_price_li_per_mtok": 1,
                  "output_price_li_per_mtok": 0,
                  "upstream_input_cost_li_per_mtok": 0,
                  "upstream_cache_cost_li_per_mtok": 0,
                  "upstream_output_cost_li_per_mtok": 0
                }
                """;

        mockMvc.perform(post("/admin/v1/prices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("billing_unit_mismatch"));
    }
}
