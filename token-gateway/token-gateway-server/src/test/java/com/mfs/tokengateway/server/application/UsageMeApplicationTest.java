package com.mfs.tokengateway.server.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenApiKeyDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenApiKey;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.api.dto.UsageMeResponse;
import com.mfs.tokengateway.server.security.ChatCaller;

@ExtendWith(MockitoExtension.class)
class UsageMeApplicationTest {

    @Mock
    private TokenUserDbService tokenUserDbService;

    @Mock
    private TokenApiKeyDbService tokenApiKeyDbService;

    private UsageMeApplication application;

    @BeforeEach
    void setUp() {
        application = new UsageMeApplication(tokenUserDbService, tokenApiKeyDbService);
    }

    @Test
    void returnsBalanceAndKeyMeta() {
        ChatCaller caller = new ChatCaller(20L, 10L, "ftcs-desktop", "1", "u_abc");
        TokenUser user = new TokenUser();
        user.setId(20L);
        user.setTenantId("1");
        user.setUserCode("u_abc");
        user.setBalanceLi(12340L);
        when(tokenUserDbService.getById(20L)).thenReturn(user);

        TokenApiKey key = new TokenApiKey();
        key.setId(10L);
        key.setName("ftcs-desktop");
        key.setKeyPrefix("sk-ab12");
        when(tokenApiKeyDbService.getById(10L)).thenReturn(key);

        UsageMeResponse body = application.getMe(caller);
        assertEquals(20L, body.getUserId());
        assertEquals(12340L, body.getBalanceLi());
        assertEquals("CNY", body.getCurrency());
        assertEquals(1000, body.getLiPerYuan());
        assertEquals("ftcs-desktop", body.getKey().getName());
        assertEquals("sk-ab12", body.getKey().getPrefix());
    }

    @Test
    void allowsZeroAndNegativeBalance() {
        ChatCaller caller = new ChatCaller(20L, 10L, "ftcs-desktop", "1", "u_abc");
        TokenUser user = new TokenUser();
        user.setId(20L);
        user.setTenantId("1");
        user.setUserCode("u_abc");
        user.setBalanceLi(-50L);
        when(tokenUserDbService.getById(20L)).thenReturn(user);

        TokenApiKey key = new TokenApiKey();
        key.setId(10L);
        key.setName("ftcs-desktop");
        key.setKeyPrefix("sk-ab12");
        when(tokenApiKeyDbService.getById(10L)).thenReturn(key);

        assertEquals(-50L, application.getMe(caller).getBalanceLi());
    }

    @Test
    void missingUserUnauthorized() {
        ChatCaller caller = new ChatCaller(20L, 10L, "ftcs-desktop", "1", "u_abc");
        when(tokenUserDbService.getById(20L)).thenReturn(null);
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> application.getMe(caller));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertEquals("invalid_api_key", ex.getReason());
    }
}
