package com.mfs.tokengateway.admin.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.mfs.tokengateway.admin.api.dto.AdminLedgerListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminLedgerListResponse.AdminLedgerListItem;
import com.mfs.tokengateway.admin.api.dto.AdminRequestDetailResponse;
import com.mfs.tokengateway.admin.api.dto.AdminRequestListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminRequestListResponse.AdminRequestListItem;
import com.mfs.tokengateway.admin.application.AdminUsageApplication;
import com.mfs.tokengateway.admin.domain.AdminApiException;

@ExtendWith(MockitoExtension.class)
class AdminUsageControllerTest {

    @Mock
    private AdminUsageApplication adminUsageApplication;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new AdminUsageController(adminUsageApplication))
                .setControllerAdvice(new AdminRestExceptionHandler())
                .build();
    }

    @Test
    void listRequestsOk() throws Exception {
        AdminRequestListResponse resp = new AdminRequestListResponse();
        resp.setPage(1);
        resp.setSize(20);
        resp.setTotal(1);
        AdminRequestListItem item = new AdminRequestListItem();
        item.setRequestId("01JABC");
        item.setBillingStatus("settle_failed");
        item.setRevenueYuan(null);
        resp.setItems(List.of(item));
        when(adminUsageApplication.listRequests(
                        isNull(),
                        isNull(),
                        isNull(),
                        eq("settle_failed"),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull()))
                .thenReturn(resp);

        mockMvc.perform(get("/admin/v1/requests").param("billing_status", "settle_failed"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].billing_status").value("settle_failed"))
                .andExpect(jsonPath("$.items[0].cogs_li").doesNotExist());
    }

    @Test
    void getRequestOk() throws Exception {
        AdminRequestDetailResponse d = new AdminRequestDetailResponse();
        d.setRequestId("01JABC");
        d.setBillingStatus("charged");
        d.setRevenueLi(5L);
        d.setRevenueYuan(new BigDecimal("0.005"));
        when(adminUsageApplication.getRequest("01JABC")).thenReturn(d);

        mockMvc.perform(get("/admin/v1/requests/01JABC"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.request_id").value("01JABC"))
                .andExpect(jsonPath("$.revenue_yuan").value(0.005));
    }

    @Test
    void listLedgerOk() throws Exception {
        AdminLedgerListResponse resp = new AdminLedgerListResponse();
        resp.setTotal(1);
        AdminLedgerListItem item = new AdminLedgerListItem();
        item.setType("charge");
        item.setAmountLi(-5L);
        resp.setItems(List.of(item));
        when(adminUsageApplication.listLedger(
                        any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(resp);

        mockMvc.perform(get("/admin/v1/ledger"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].type").value("charge"));
    }

    @Test
    void userRequestsNotFound() throws Exception {
        when(adminUsageApplication.listRequestsForUser(
                        anyLong(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(AdminApiException.notFound("user_not_found", "missing"));

        mockMvc.perform(get("/admin/v1/users/9/requests"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("user_not_found"));
    }
}
