package com.mfs.tokengateway.admin.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.mfs.tokengateway.admin.api.dto.AdminUserKeyListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyListResponse.AdminUserKeyItem;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyRotateResponse;
import com.mfs.tokengateway.admin.application.AdminUserKeyApplication;
import com.mfs.tokengateway.admin.domain.AdminApiException;

@ExtendWith(MockitoExtension.class)
class AdminUserKeyControllerTest {

    @Mock
    private AdminUserKeyApplication adminUserKeyApplication;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new AdminUserKeyController(adminUserKeyApplication))
                .setControllerAdvice(new AdminRestExceptionHandler())
                .build();
    }

    @Test
    void listOk() throws Exception {
        AdminUserKeyListResponse resp = new AdminUserKeyListResponse();
        resp.setUserId(42L);
        AdminUserKeyItem item = new AdminUserKeyItem();
        item.setId(7L);
        item.setName("ftcs-desktop");
        item.setPrefix("sk-Ab12CdEf");
        item.setStatus("active");
        resp.setItems(List.of(item));
        when(adminUserKeyApplication.list(42L)).thenReturn(resp);

        mockMvc.perform(get("/admin/v1/users/42/keys"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user_id").value(42))
                .andExpect(jsonPath("$.items[0].name").value("ftcs-desktop"))
                .andExpect(jsonPath("$.items[0].prefix").value("sk-Ab12CdEf"))
                .andExpect(jsonPath("$.items[0].key_hash").doesNotExist());
    }

    @Test
    void patchStatusOk() throws Exception {
        AdminUserKeyItem item = new AdminUserKeyItem();
        item.setName("ftcs-desktop");
        item.setStatus("disabled");
        when(adminUserKeyApplication.updateStatus(eq(42L), eq("ftcs-desktop"), any(), anyString()))
                .thenReturn(item);

        mockMvc.perform(patch("/admin/v1/users/42/keys/ftcs-desktop/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"disabled","operator":"ops","note":"leak"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("disabled"));
    }

    @Test
    void rotateOk() throws Exception {
        AdminUserKeyRotateResponse resp = new AdminUserKeyRotateResponse();
        resp.setAction("rotated");
        resp.setUserId(42L);
        resp.setName("ftcs-desktop");
        resp.setPrefix("sk-newxxxxx");
        resp.setStatus("active");
        resp.setApiKey("sk-secret-once");
        when(adminUserKeyApplication.rotate(eq(42L), eq("ftcs-desktop"), any(), anyString()))
                .thenReturn(resp);

        mockMvc.perform(post("/admin/v1/users/42/keys/ftcs-desktop/rotate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"operator":"ops","note":"reset"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("rotated"))
                .andExpect(jsonPath("$.api_key").value("sk-secret-once"));
    }

    @Test
    void keyNotFound() throws Exception {
        when(adminUserKeyApplication.updateStatus(anyLong(), anyString(), any(), any()))
                .thenThrow(AdminApiException.notFound("key_not_found", "missing"));

        mockMvc.perform(patch("/admin/v1/users/42/keys/missing/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"disabled","operator":"ops","note":"x"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("key_not_found"));
    }
}
