package com.mfs.tokengateway.server.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.server.application.SearchProxyApplication;
import com.mfs.tokengateway.server.security.PendingSearchAuthFacade;
import com.mfs.tokengateway.server.security.SearchAuthFacade;

@ExtendWith(MockitoExtension.class)
class SearchControllerTest {

    @Mock
    private SearchProxyApplication searchProxyApplication;

    private SearchController controller;

    @BeforeEach
    void setUp() {
        SearchAuthFacade pending = new PendingSearchAuthFacade();
        controller = new SearchController(pending, searchProxyApplication);
    }

    @Test
    void authPlaceholderRejectsBeforeProxy() {
        ObjectNode body = new ObjectMapper().createObjectNode();
        body.put("query", "ok");

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.search(body));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertEquals("sk_auth_pending", ex.getReason());
        verify(searchProxyApplication, never()).search(any());
    }
}
