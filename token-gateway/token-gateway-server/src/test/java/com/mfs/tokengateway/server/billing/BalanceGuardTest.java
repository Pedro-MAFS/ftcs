package com.mfs.tokengateway.server.billing;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;

@ExtendWith(MockitoExtension.class)
class BalanceGuardTest {

    @Mock
    private TokenUserDbService tokenUserDbService;

    private TokenGatewayProperties properties;
    private BalanceGuard guard;

    @BeforeEach
    void setUp() {
        properties = new TokenGatewayProperties();
        properties.getBilling().setMinBalanceLi(1L);
        guard = new BalanceGuard(properties, tokenUserDbService);
        guard.validateConfig();
    }

    @Test
    void allowsWhenBalanceAtMin() {
        when(tokenUserDbService.getById(20L)).thenReturn(user(20L, 1L));
        assertDoesNotThrow(() -> guard.requireSufficientBalance(20L));
        verify(tokenUserDbService).getById(20L);
    }

    @Test
    void allowsWhenBalanceAboveMin() {
        when(tokenUserDbService.getById(20L)).thenReturn(user(20L, 1000L));
        assertDoesNotThrow(() -> guard.requireSufficientBalance(20L));
    }

    @Test
    void rejectsWhenBalanceZero() {
        when(tokenUserDbService.getById(20L)).thenReturn(user(20L, 0L));
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> guard.requireSufficientBalance(20L));
        assertEquals(HttpStatus.PAYMENT_REQUIRED, ex.getStatusCode());
        assertEquals("insufficient_balance", ex.getReason());
    }

    @Test
    void rejectsWhenBalanceNegative() {
        when(tokenUserDbService.getById(20L)).thenReturn(user(20L, -50L));
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> guard.requireSufficientBalance(20L));
        assertEquals(HttpStatus.PAYMENT_REQUIRED, ex.getStatusCode());
        assertEquals("insufficient_balance", ex.getReason());
    }

    @Test
    void rejectsWhenBelowCustomMin() {
        properties.getBilling().setMinBalanceLi(100L);
        when(tokenUserDbService.getById(20L)).thenReturn(user(20L, 50L));
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> guard.requireSufficientBalance(20L));
        assertEquals(HttpStatus.PAYMENT_REQUIRED, ex.getStatusCode());
    }

    @Test
    void treatsNullBalanceAsZero() {
        TokenUser user = user(20L, null);
        when(tokenUserDbService.getById(20L)).thenReturn(user);
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> guard.requireSufficientBalance(20L));
        assertEquals("insufficient_balance", ex.getReason());
    }

    @Test
    void orphanUserReturnsUnauthorized() {
        when(tokenUserDbService.getById(99L)).thenReturn(null);
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> guard.requireSufficientBalance(99L));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertEquals("invalid_api_key", ex.getReason());
    }

    @Test
    void rejectsNegativeMinConfig() {
        properties.getBilling().setMinBalanceLi(-1L);
        assertThrows(IllegalStateException.class, () -> guard.validateConfig());
    }

    private static TokenUser user(long id, Long balanceLi) {
        TokenUser user = new TokenUser();
        user.setId(id);
        user.setBalanceLi(balanceLi);
        user.setStatus("active");
        return user;
    }
}
