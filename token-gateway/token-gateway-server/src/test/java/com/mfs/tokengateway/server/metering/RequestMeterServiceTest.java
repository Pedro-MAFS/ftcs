package com.mfs.tokengateway.server.metering;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.server.pricing.UsageTokensParser;
import com.mfs.tokengateway.server.security.ChatCaller;

@ExtendWith(MockitoExtension.class)
class RequestMeterServiceTest {

    @Mock
    private TokenRequestLogDbService requestLogDbService;

    private final UsageTokensParser parser = new UsageTokensParser();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void insertsPendingWithNullAmounts() {
        RequestMeterService service = new RequestMeterService(requestLogDbService, parser);
        ChatCaller caller = new ChatCaller(1L, 2L, "ftcs-desktop", "t", "u");
        ObjectNode usage = mapper.createObjectNode();
        usage.put("prompt_tokens", 10);
        usage.put("completion_tokens", 3);

        service.record(new RequestMeterCommand(
                "req-1",
                caller,
                "deepseek-v4-flash",
                RequestMeterService.STATUS_SUCCESS,
                usage,
                12,
                200,
                null));

        ArgumentCaptor<TokenRequestLog> captor = ArgumentCaptor.forClass(TokenRequestLog.class);
        verify(requestLogDbService).insertLog(captor.capture());
        TokenRequestLog row = captor.getValue();
        assertEquals("req-1", row.getRequestId());
        assertEquals(1L, row.getUserId());
        assertEquals(2L, row.getKeyId());
        assertEquals("ftcs-desktop", row.getKeyName());
        assertEquals(10, row.getPromptTokens());
        assertEquals(3, row.getCompletionTokens());
        assertNull(row.getRevenueLi());
        assertNull(row.getCogsLi());
        assertNull(row.getMarginLi());
        assertEquals(RequestMeterService.BILLING_PENDING, row.getBillingStatus());
    }

    @Test
    void skippedWhenNoUsage() {
        RequestMeterService service = new RequestMeterService(requestLogDbService, parser);
        ChatCaller caller = new ChatCaller(1L, 2L, "k", "t", "u");
        service.record(new RequestMeterCommand(
                "req-2",
                caller,
                "deepseek-v4-flash",
                RequestMeterService.STATUS_ERROR,
                null,
                1,
                500,
                "upstream_error"));

        ArgumentCaptor<TokenRequestLog> captor = ArgumentCaptor.forClass(TokenRequestLog.class);
        verify(requestLogDbService).insertLog(captor.capture());
        assertEquals(RequestMeterService.BILLING_SKIPPED, captor.getValue().getBillingStatus());
        assertNull(captor.getValue().getPromptTokens());
    }

    @Test
    void skipsWhenNoCaller() {
        RequestMeterService service = new RequestMeterService(requestLogDbService, parser);
        service.record(new RequestMeterCommand(
                "req-3", null, "deepseek-v4-flash", "success", null, null, null, null));
        verify(requestLogDbService, never()).insertLog(any());
    }
}
