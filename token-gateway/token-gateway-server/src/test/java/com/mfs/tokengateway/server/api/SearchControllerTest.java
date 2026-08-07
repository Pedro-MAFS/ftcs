package com.mfs.tokengateway.server.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
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
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.application.SearchProxyApplication;
import com.mfs.tokengateway.server.billing.BalanceGuard;
import com.mfs.tokengateway.server.security.ChatAuthFacade;
import com.mfs.tokengateway.server.security.ChatCaller;

@ExtendWith(MockitoExtension.class)
class SearchControllerTest {

    @Mock
    private ChatAuthFacade chatAuthFacade;

    @Mock
    private BalanceGuard balanceGuard;

    @Mock
    private SearchProxyApplication searchProxyApplication;

    private SearchController controller;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        controller = new SearchController(chatAuthFacade, balanceGuard, searchProxyApplication);
        MockHttpServletRequest request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void authFailureDoesNotCallProxy() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(chatAuthFacade.requireAuthenticated())
                .thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid_api_key"));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.search(body));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertEquals("invalid_api_key", ex.getReason());
        verify(balanceGuard, never()).requireSufficientBalance(any(Long.class));
        verify(searchProxyApplication, never()).search(any());
    }

    @Test
    void keyDisabledDoesNotCallProxy() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        when(chatAuthFacade.requireAuthenticated())
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "key_disabled"));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.search(body));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertEquals("key_disabled", ex.getReason());
        verify(balanceGuard, never()).requireSufficientBalance(any(Long.class));
        verify(searchProxyApplication, never()).search(any());
    }

    @Test
    void insufficientBalanceDoesNotCallProxy() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        ChatCaller caller = new ChatCaller(9L, 1L, "ftcs-desktop", "t", "u");
        when(chatAuthFacade.requireAuthenticated()).thenReturn(caller);
        doThrow(new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "insufficient_balance"))
                .when(balanceGuard)
                .requireSufficientBalance(9L);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.search(body));
        assertEquals(HttpStatus.PAYMENT_REQUIRED, ex.getStatusCode());
        assertEquals("insufficient_balance", ex.getReason());
        verify(searchProxyApplication, never()).search(any());
    }

    @Test
    void authAndBalanceOkCallsProxyAndStoresCaller() {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", "ok");
        ChatCaller caller = new ChatCaller(9L, 1L, "ftcs-desktop", "t", "u");
        when(chatAuthFacade.requireAuthenticated()).thenReturn(caller);
        when(searchProxyApplication.search(body))
                .thenReturn(ResponseEntity.ok("{\"results\":[]}"));

        ResponseEntity<String> resp = controller.search(body);

        assertEquals(200, resp.getStatusCode().value());
        verify(balanceGuard).requireSufficientBalance(9L);
        verify(searchProxyApplication).search(body);
        Object stored = RequestContextHolder.getRequestAttributes()
                .getAttribute(ChatCaller.REQUEST_ATTR, RequestAttributes.SCOPE_REQUEST);
        assertSame(caller, stored);
    }
}
