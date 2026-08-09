package com.mfs.tokengateway.admin.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.mfs.tokengateway.admin.api.dto.AdminUserKeyListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyListResponse.AdminUserKeyItem;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyRotateRequest;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyRotateResponse;
import com.mfs.tokengateway.admin.api.dto.AdminUserKeyStatusUpdateRequest;
import com.mfs.tokengateway.admin.config.GatewayKeyProperties;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.db.security.GatewayApiKeyGenerator;
import com.mfs.tokengateway.db.security.GatewayApiKeyHasher;

@ExtendWith(MockitoExtension.class)
class AdminUserKeyApplicationTest {

    @Mock
    private TokenUserDbService tokenUserDbService;

    @Mock
    private TokenApiKeyDbService tokenApiKeyDbService;

    @Mock
    private GatewayApiKeyGenerator apiKeyGenerator;

    @Mock
    private GatewayApiKeyHasher apiKeyHasher;

    private GatewayKeyProperties keyProperties;
    private AdminUserKeyApplication app;

    @BeforeEach
    void setUp() {
        keyProperties = new GatewayKeyProperties();
        keyProperties.setPepper("test-pepper");
        // self 代理：单测直调时用同一实例即可（rotate 走 self.rotateInTransaction）
        app = new AdminUserKeyApplication(
                null,
                tokenUserDbService,
                tokenApiKeyDbService,
                apiKeyGenerator,
                apiKeyHasher,
                keyProperties);
        app = new AdminUserKeyApplication(
                app,
                tokenUserDbService,
                tokenApiKeyDbService,
                apiKeyGenerator,
                apiKeyHasher,
                keyProperties);
    }

    @Test
    void listMapsItemsWithoutHash() {
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L, "active"));
        TokenApiKey key = key(7L, "ftcs-desktop", "sk-Ab12CdEf", "active");
        key.setKeyHash("should-not-appear");
        when(tokenApiKeyDbService.listByUserId(42L)).thenReturn(List.of(key));

        AdminUserKeyListResponse resp = app.list(42L);
        assertEquals(42L, resp.getUserId());
        assertEquals(1, resp.getItems().size());
        AdminUserKeyItem item = resp.getItems().get(0);
        assertEquals("ftcs-desktop", item.getName());
        assertEquals("sk-Ab12CdEf", item.getPrefix());
        assertEquals("active", item.getStatus());
    }

    @Test
    void listUserNotFound() {
        when(tokenUserDbService.getById(9L)).thenReturn(null);
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.list(9L));
        assertEquals("user_not_found", ex.getCode());
    }

    @Test
    void updateStatusDisables() {
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L, "active"));
        TokenApiKey before = key(7L, "ftcs-desktop", "sk-Ab12CdEf", "active");
        TokenApiKey after = key(7L, "ftcs-desktop", "sk-Ab12CdEf", "disabled");
        when(tokenApiKeyDbService.findByUserIdAndName(42L, "ftcs-desktop"))
                .thenReturn(before, after);
        when(tokenApiKeyDbService.updateStatus(42L, "ftcs-desktop", "disabled")).thenReturn(true);

        AdminUserKeyStatusUpdateRequest req = new AdminUserKeyStatusUpdateRequest();
        req.setStatus("DISABLED");
        req.setOperator("ops");
        req.setNote("leak");

        AdminUserKeyItem item = app.updateStatus(42L, "FTCS-Desktop", req, "127.0.0.1");
        assertEquals("disabled", item.getStatus());
        verify(tokenApiKeyDbService).updateStatus(42L, "ftcs-desktop", "disabled");
    }

    @Test
    void updateStatusNoop() {
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L, "active"));
        TokenApiKey row = key(7L, "ftcs-desktop", "sk-Ab12CdEf", "disabled");
        when(tokenApiKeyDbService.findByUserIdAndName(42L, "ftcs-desktop")).thenReturn(row);

        AdminUserKeyStatusUpdateRequest req = new AdminUserKeyStatusUpdateRequest();
        req.setStatus("disabled");
        req.setOperator("ops");
        req.setNote("already");

        AdminUserKeyItem item = app.updateStatus(42L, "ftcs-desktop", req, null);
        assertEquals("disabled", item.getStatus());
        verify(tokenApiKeyDbService, never()).updateStatus(anyLong(), anyString(), anyString());
    }

    @Test
    void updateStatusKeyNotFound() {
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L, "active"));
        when(tokenApiKeyDbService.findByUserIdAndName(42L, "missing")).thenReturn(null);

        AdminUserKeyStatusUpdateRequest req = new AdminUserKeyStatusUpdateRequest();
        req.setStatus("disabled");
        req.setOperator("ops");
        req.setNote("x");

        AdminApiException ex =
                assertThrows(AdminApiException.class, () -> app.updateStatus(42L, "missing", req, null));
        assertEquals("key_not_found", ex.getCode());
    }

    @Test
    void updateStatusRejectsBlankNote() {
        AdminUserKeyStatusUpdateRequest req = new AdminUserKeyStatusUpdateRequest();
        req.setStatus("disabled");
        req.setOperator("ops");
        req.setNote(" ");
        AdminApiException ex =
                assertThrows(AdminApiException.class, () -> app.updateStatus(1L, "a", req, null));
        assertEquals("validation_error", ex.getCode());
    }

    @Test
    void rotateCreatesWhenMissing() {
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L, "disabled"));
        when(tokenApiKeyDbService.findByUserIdAndName(42L, "ftcs-desktop")).thenReturn(null);
        when(apiKeyGenerator.generate()).thenReturn("sk-newplaintextxxxxxxxxxxxxxxxx");
        when(apiKeyHasher.hash(eq("test-pepper"), anyString())).thenReturn("hash-new");
        when(apiKeyGenerator.prefixOf(anyString())).thenReturn("sk-newplai");

        AdminUserKeyRotateRequest req = new AdminUserKeyRotateRequest();
        req.setOperator("ops");
        req.setNote("issue");

        AdminUserKeyRotateResponse resp = app.rotate(42L, "ftcs-desktop", req, "10.0.0.1");
        assertEquals("created", resp.getAction());
        assertEquals("sk-newplaintextxxxxxxxxxxxxxxxx", resp.getApiKey());
        assertEquals("active", resp.getStatus());

        ArgumentCaptor<TokenApiKey> cap = ArgumentCaptor.forClass(TokenApiKey.class);
        verify(tokenApiKeyDbService).save(cap.capture());
        assertEquals("hash-new", cap.getValue().getKeyHash());
        assertEquals("active", cap.getValue().getStatus());
    }

    @Test
    void rotateUpdatesExisting() {
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L, "active"));
        TokenApiKey existing = key(7L, "ftcs-desktop", "sk-oldxxxxx", "disabled");
        existing.setKeyHash("old-hash");
        when(tokenApiKeyDbService.findByUserIdAndName(42L, "ftcs-desktop")).thenReturn(existing);
        when(apiKeyGenerator.generate()).thenReturn("sk-rotatedkeyyyyyyyyyyyyyyyyy");
        when(apiKeyHasher.hash(eq("test-pepper"), anyString())).thenReturn("hash-rot");
        when(apiKeyGenerator.prefixOf(anyString())).thenReturn("sk-rotated");

        AdminUserKeyRotateRequest req = new AdminUserKeyRotateRequest();
        req.setOperator("ops");
        req.setNote("reset");

        AdminUserKeyRotateResponse resp = app.rotate(42L, "ftcs-desktop", req, null);
        assertEquals("rotated", resp.getAction());
        assertTrue(resp.getApiKey().startsWith("sk-"));
        verify(tokenApiKeyDbService).updateById(existing);
        assertEquals("hash-rot", existing.getKeyHash());
        assertEquals("active", existing.getStatus());
    }

    @Test
    void rotateRequiresPepper() {
        keyProperties.setPepper(" ");
        when(tokenUserDbService.getById(42L)).thenReturn(user(42L, "active"));

        AdminUserKeyRotateRequest req = new AdminUserKeyRotateRequest();
        req.setOperator("ops");
        req.setNote("x");

        AdminApiException ex =
                assertThrows(AdminApiException.class, () -> app.rotate(42L, "ftcs-desktop", req, null));
        assertEquals("pepper_not_configured", ex.getCode());
        assertNull(ex.getCause());
    }

    @Test
    void normalizeNameInvalid() {
        AdminApiException ex =
                assertThrows(AdminApiException.class, () -> AdminUserKeyApplication.normalizeName("bad name"));
        assertEquals("invalid_name", ex.getCode());
    }

    private static TokenUser user(long id, String status) {
        TokenUser u = new TokenUser();
        u.setId(id);
        u.setTenantId("t1");
        u.setUserCode("u_1");
        u.setStatus(status);
        return u;
    }

    private static TokenApiKey key(long id, String name, String prefix, String status) {
        TokenApiKey k = new TokenApiKey();
        k.setId(id);
        k.setUserId(42L);
        k.setName(name);
        k.setKeyPrefix(prefix);
        k.setStatus(status);
        k.setCreatedAt(LocalDateTime.parse("2026-06-01T10:12:00"));
        k.setUpdatedAt(LocalDateTime.parse("2026-08-01T09:00:00"));
        return k;
    }
}
