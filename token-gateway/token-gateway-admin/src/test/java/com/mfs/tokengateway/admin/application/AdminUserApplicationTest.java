package com.mfs.tokengateway.admin.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mfs.tokengateway.admin.api.dto.AdminUserDetailResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserStatusUpdateRequest;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService.KeyStatusCounts;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenUser;

@ExtendWith(MockitoExtension.class)
class AdminUserApplicationTest {

    @Mock
    private TokenUserDbService tokenUserDbService;

    @Mock
    private TokenApiKeyDbService tokenApiKeyDbService;

    private AdminUserApplication app;

    @BeforeEach
    void setUp() {
        app = new AdminUserApplication(tokenUserDbService, tokenApiKeyDbService);
    }

    @Test
    void listMapsPage() {
        TokenUser u = user(42L, "u_91bb04", "active", 2450000L);
        Page<TokenUser> page = new Page<>(1, 20);
        page.setRecords(List.of(u));
        page.setTotal(1);
        when(tokenUserDbService.pageUsers(isNull(), isNull(), isNull(), isNull(), eq(1), eq(20)))
                .thenReturn(page);

        AdminUserListResponse resp = app.list(null, null, null, null, null, null);
        assertEquals(1, resp.getTotal());
        assertEquals(42L, resp.getItems().get(0).getId());
        assertEquals("2450.000", resp.getItems().get(0).getBalanceYuan().toPlainString());
    }

    @Test
    void getNotFound() {
        when(tokenUserDbService.getById(9L)).thenReturn(null);
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.get(9L));
        assertEquals("user_not_found", ex.getCode());
    }

    @Test
    void getIncludesKeyCounts() {
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L, "u_91bb04", "active", 1000L));
        when(tokenApiKeyDbService.countByUserId(42L)).thenReturn(new KeyStatusCounts(3, 2, 1));

        AdminUserDetailResponse d = app.get(42L);
        assertEquals(3L, d.getKeyTotal());
        assertEquals(2L, d.getKeyActive());
        assertEquals(1L, d.getKeyDisabled());
        assertEquals("1.000", d.getBalanceYuan().toPlainString());
    }

    @Test
    void updateStatusDisables() {
        TokenUser before = user(42L, "u_91bb04", "active", 1000L);
        TokenUser after = user(42L, "u_91bb04", "disabled", 1000L);
        when(tokenUserDbService.getById(42L)).thenReturn(before, after);
        when(tokenUserDbService.updateStatus(42L, "disabled")).thenReturn(true);
        when(tokenApiKeyDbService.countByUserId(42L)).thenReturn(new KeyStatusCounts(0, 0, 0));

        AdminUserStatusUpdateRequest req = new AdminUserStatusUpdateRequest();
        req.setStatus("DISABLED");
        req.setOperator("ops");
        req.setNote("abuse");

        AdminUserDetailResponse d = app.updateStatus(42L, req, "127.0.0.1");
        assertEquals("disabled", d.getStatus());
        verify(tokenUserDbService).updateStatus(42L, "disabled");
    }

    @Test
    void updateStatusNoopStillAudits() {
        TokenUser u = user(42L, "u_91bb04", "active", 1000L);
        when(tokenUserDbService.getById(42L)).thenReturn(u);
        when(tokenApiKeyDbService.countByUserId(42L)).thenReturn(new KeyStatusCounts(0, 0, 0));

        AdminUserStatusUpdateRequest req = new AdminUserStatusUpdateRequest();
        req.setStatus("active");
        req.setOperator("ops");
        req.setNote("confirm");

        AdminUserDetailResponse d = app.updateStatus(42L, req, null);
        assertEquals("active", d.getStatus());
        verify(tokenUserDbService).getById(42L);
    }

    @Test
    void updateStatusRejectsBlankNote() {
        AdminUserStatusUpdateRequest req = new AdminUserStatusUpdateRequest();
        req.setStatus("disabled");
        req.setOperator("ops");
        req.setNote("  ");
        AdminApiException ex =
                assertThrows(AdminApiException.class, () -> app.updateStatus(1L, req, null));
        assertEquals("validation_error", ex.getCode());
    }

    @Test
    void invalidStatusOnList() {
        AdminApiException ex = assertThrows(
                AdminApiException.class, () -> app.list(null, "frozen", null, null, 1, 20));
        assertEquals("validation_error", ex.getCode());
    }

    @Test
    void pageBounds() {
        AdminApiException ex =
                assertThrows(AdminApiException.class, () -> app.list(null, null, null, null, 0, 20));
        assertTrue(ex.getMessage().contains("page"));
    }

    private static TokenUser user(long id, String code, String status, long balance) {
        TokenUser u = new TokenUser();
        u.setId(id);
        u.setTenantId("tenant_acme");
        u.setUserCode(code);
        u.setStatus(status);
        u.setBalanceLi(balance);
        u.setCreatedAt(LocalDateTime.parse("2026-06-01T10:12:00"));
        u.setUpdatedAt(LocalDateTime.parse("2026-08-09T18:40:00"));
        return u;
    }
}
