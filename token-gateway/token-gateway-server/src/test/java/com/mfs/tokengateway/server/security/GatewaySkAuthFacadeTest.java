package com.mfs.tokengateway.server.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

@ExtendWith(MockitoExtension.class)
class GatewaySkAuthFacadeTest {

    @Mock
    private GatewayApiKeyHasher apiKeyHasher;

    @Mock
    private TokenApiKeyDbService tokenApiKeyDbService;

    @Mock
    private TokenUserDbService tokenUserDbService;

    private TokenGatewayProperties properties;
    private GatewaySkAuthFacade facade;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        properties = new TokenGatewayProperties();
        properties.getKey().setPepper("test-pepper");
        facade = new GatewaySkAuthFacade(
                properties, apiKeyHasher, tokenApiKeyDbService, tokenUserDbService);
        request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void authenticatesActiveKeyAndUser() {
        request.addHeader("Authorization", "Bearer sk-good");
        when(apiKeyHasher.hash("test-pepper", "sk-good")).thenReturn("hash1");

        TokenApiKey key = new TokenApiKey();
        key.setId(10L);
        key.setUserId(20L);
        key.setName("ftcs-desktop");
        key.setStatus("active");
        when(tokenApiKeyDbService.findByKeyHash("hash1")).thenReturn(key);

        TokenUser user = new TokenUser();
        user.setId(20L);
        user.setTenantId("1");
        user.setUserCode("u_abc");
        user.setStatus("active");
        when(tokenUserDbService.getById(20L)).thenReturn(user);

        ChatCaller caller = facade.requireAuthenticated();
        assertEquals(20L, caller.getUserId());
        assertEquals(10L, caller.getKeyId());
        assertEquals("ftcs-desktop", caller.getKeyName());
        assertEquals("1", caller.getTenantId());
        assertEquals("u_abc", caller.getUserCode());
        verify(tokenApiKeyDbService).updateById(any(TokenApiKey.class));
    }

    @Test
    void rejectsMissingAuthorization() {
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, facade::requireAuthenticated);
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertEquals("missing_authorization", ex.getReason());
    }

    @Test
    void rejectsNonSkPrefix() {
        request.addHeader("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.xx");
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, facade::requireAuthenticated);
        assertEquals("invalid_api_key", ex.getReason());
        verify(tokenApiKeyDbService, never()).findByKeyHash(anyString());
    }

    @Test
    void rejectsUnknownHash() {
        request.addHeader("Authorization", "Bearer sk-missing");
        when(apiKeyHasher.hash(anyString(), anyString())).thenReturn("nope");
        when(tokenApiKeyDbService.findByKeyHash("nope")).thenReturn(null);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, facade::requireAuthenticated);
        assertEquals("invalid_api_key", ex.getReason());
    }

    @Test
    void rejectsDisabledKey() {
        request.addHeader("Authorization", "Bearer sk-x");
        when(apiKeyHasher.hash(anyString(), anyString())).thenReturn("h");
        TokenApiKey key = new TokenApiKey();
        key.setId(1L);
        key.setUserId(2L);
        key.setStatus("disabled");
        when(tokenApiKeyDbService.findByKeyHash("h")).thenReturn(key);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, facade::requireAuthenticated);
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertEquals("key_disabled", ex.getReason());
        verify(tokenUserDbService, never()).getById(anyLong());
    }

    @Test
    void rejectsDisabledAccount() {
        request.addHeader("Authorization", "Bearer sk-x");
        when(apiKeyHasher.hash(anyString(), anyString())).thenReturn("h");
        TokenApiKey key = new TokenApiKey();
        key.setId(1L);
        key.setUserId(2L);
        key.setName("a");
        key.setStatus("active");
        when(tokenApiKeyDbService.findByKeyHash("h")).thenReturn(key);

        TokenUser user = new TokenUser();
        user.setId(2L);
        user.setStatus("disabled");
        when(tokenUserDbService.getById(2L)).thenReturn(user);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, facade::requireAuthenticated);
        assertEquals("account_disabled", ex.getReason());
    }

    @Test
    void orphanKeyLooksLikeInvalid() {
        request.addHeader("Authorization", "Bearer sk-x");
        when(apiKeyHasher.hash(anyString(), anyString())).thenReturn("h");
        TokenApiKey key = new TokenApiKey();
        key.setId(1L);
        key.setUserId(99L);
        key.setStatus("active");
        when(tokenApiKeyDbService.findByKeyHash("h")).thenReturn(key);
        when(tokenUserDbService.getById(99L)).thenReturn(null);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, facade::requireAuthenticated);
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertEquals("invalid_api_key", ex.getReason());
    }

    @Test
    void rejectsMissingPepper() {
        properties.getKey().setPepper("");
        request.addHeader("Authorization", "Bearer sk-x");
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, facade::requireAuthenticated);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertEquals("missing_gateway_key_pepper", ex.getReason());
    }
}
