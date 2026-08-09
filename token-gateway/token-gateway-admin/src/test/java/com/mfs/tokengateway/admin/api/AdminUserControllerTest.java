package com.mfs.tokengateway.admin.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.mfs.tokengateway.admin.api.dto.AdminUserDetailResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserListResponse.AdminUserListItem;
import com.mfs.tokengateway.admin.application.AdminUserApplication;
import com.mfs.tokengateway.admin.domain.AdminApiException;

@ExtendWith(MockitoExtension.class)
class AdminUserControllerTest {

    @Mock
    private AdminUserApplication adminUserApplication;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new AdminUserController(adminUserApplication))
                .setControllerAdvice(new AdminRestExceptionHandler())
                .build();
    }

    @Test
    void listOk() throws Exception {
        AdminUserListResponse resp = new AdminUserListResponse();
        resp.setPage(1);
        resp.setSize(20);
        resp.setTotal(1);
        AdminUserListItem item = new AdminUserListItem();
        item.setId(42L);
        item.setUserCode("u_91bb04");
        item.setStatus("active");
        item.setBalanceLi(1000L);
        item.setBalanceYuan(new BigDecimal("1.000"));
        resp.setItems(List.of(item));
        when(adminUserApplication.list(isNull(), isNull(), isNull(), isNull(), isNull(), isNull()))
                .thenReturn(resp);

        mockMvc.perform(get("/admin/v1/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].user_code").value("u_91bb04"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void getMaps404() throws Exception {
        when(adminUserApplication.get(9L))
                .thenThrow(AdminApiException.notFound("user_not_found", "missing"));

        mockMvc.perform(get("/admin/v1/users/9"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("user_not_found"));
    }

    @Test
    void patchStatusOk() throws Exception {
        AdminUserDetailResponse detail = new AdminUserDetailResponse();
        detail.setId(42L);
        detail.setStatus("disabled");
        when(adminUserApplication.updateStatus(anyLong(), any(), anyString())).thenReturn(detail);

        String body = """
                {
                  "status": "disabled",
                  "operator": "ops",
                  "note": "abuse"
                }
                """;

        mockMvc.perform(patch("/admin/v1/users/42/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("disabled"));
    }
}
