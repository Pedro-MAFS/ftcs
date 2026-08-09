package com.mfs.tokengateway.admin.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.stubbing.Answer;

import com.mfs.tokengateway.admin.api.dto.AdminAdjustmentRequest;
import com.mfs.tokengateway.admin.api.dto.AdminAdjustmentResponse;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;
import com.mfs.tokengateway.db.po.TokenUser;

@ExtendWith(MockitoExtension.class)
class AdminAdjustmentApplicationTest {

    @Mock
    private TokenUserDbService tokenUserDbService;
    @Mock
    private TokenLedgerEntryDbService ledgerEntryDbService;

    private AdminAdjustmentApplication app;

    @BeforeEach
    void setUp() {
        app = new AdminAdjustmentApplication(tokenUserDbService, ledgerEntryDbService);
    }

    @Test
    void topupByYuanIncreasesBalanceAndWritesLedger() {
        TokenUser user = user(42L, 0L, "active");
        when(tokenUserDbService.lockById(42L)).thenReturn(user);
        when(tokenUserDbService.updateBalanceLi(42L, 10000L)).thenReturn(true);
        doAnswer(assignId(9002L)).when(ledgerEntryDbService).insertTopup(any());

        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("topup");
        req.setAmountYuan(new BigDecimal("10.000"));
        req.setOperator("ops:alice");
        req.setNote("客服补救");

        AdminAdjustmentResponse resp = app.adjust(42L, req, "127.0.0.1");
        assertEquals(9002L, resp.getLedgerId());
        assertEquals("topup", resp.getType());
        assertEquals(10000L, resp.getAmountLi());
        assertEquals(0L, resp.getBalanceBeforeLi());
        assertEquals(10000L, resp.getBalanceAfterLi());
        assertEquals("manual", resp.getSource());

        ArgumentCaptor<TokenLedgerEntry> cap = ArgumentCaptor.forClass(TokenLedgerEntry.class);
        verify(ledgerEntryDbService).insertTopup(cap.capture());
        assertEquals(10000L, cap.getValue().getAmountLi());
        assertNull(cap.getValue().getRequestId());
        assertEquals("ops:alice", cap.getValue().getOperator());
    }

    @Test
    void adjustNegativeWhenEnoughBalance() {
        TokenUser user = user(1L, 10000L, "active");
        when(tokenUserDbService.lockById(1L)).thenReturn(user);
        when(tokenUserDbService.updateBalanceLi(1L, 5000L)).thenReturn(true);
        doAnswer(assignId(1L)).when(ledgerEntryDbService).insertAdjust(any());

        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("adjust");
        req.setAmountLi(-5000L);
        req.setOperator("ops:bob");
        req.setNote("对账纠错");

        AdminAdjustmentResponse resp = app.adjust(1L, req, "10.0.0.1");
        assertEquals("adjust", resp.getType());
        assertEquals(-5000L, resp.getAmountLi());
        assertEquals(5000L, resp.getBalanceAfterLi());
        verify(ledgerEntryDbService).insertAdjust(any());
        verify(ledgerEntryDbService, never()).insertTopup(any());
    }

    @Test
    void adjustRejectsNegativeBalanceResult() {
        TokenUser user = user(1L, 1000L, "active");
        when(tokenUserDbService.lockById(1L)).thenReturn(user);

        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("adjust");
        req.setAmountLi(-5000L);
        req.setOperator("ops:bob");
        req.setNote("过大扣回");

        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.adjust(1L, req, null));
        assertEquals("balance_would_be_negative", ex.getCode());
        verify(tokenUserDbService, never()).updateBalanceLi(anyLong(), anyLong());
        verify(ledgerEntryDbService, never()).insertAdjust(any());
    }

    @Test
    void missingOperatorOrNoteRejected() {
        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("topup");
        req.setAmountLi(1000L);
        req.setNote("x");
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.adjust(1L, req, null));
        assertEquals("validation_error", ex.getCode());

        req.setOperator("ops:a");
        req.setNote("  ");
        ex = assertThrows(AdminApiException.class, () -> app.adjust(1L, req, null));
        assertEquals("validation_error", ex.getCode());
    }

    @Test
    void reservedOperatorRejected() {
        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("topup");
        req.setAmountLi(1000L);
        req.setOperator("WeChat_Pay");
        req.setNote("fake");
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.adjust(1L, req, null));
        assertEquals("reserved_operator", ex.getCode());
    }

    @Test
    void userNotFound() {
        when(tokenUserDbService.lockById(99L)).thenReturn(null);
        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("topup");
        req.setAmountLi(1000L);
        req.setOperator("ops:a");
        req.setNote("n");
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.adjust(99L, req, null));
        assertEquals("user_not_found", ex.getCode());
    }

    @Test
    void topupZeroOrNegativeRejected() {
        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("topup");
        req.setAmountLi(0L);
        req.setOperator("ops:a");
        req.setNote("n");
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.adjust(1L, req, null));
        assertEquals("invalid_amount", ex.getCode());
    }

    @Test
    void amountTooLargeRejected() {
        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("topup");
        req.setAmountLi(100_000_001L);
        req.setOperator("ops:a");
        req.setNote("n");
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.adjust(1L, req, null));
        assertEquals("amount_too_large", ex.getCode());
    }

    @Test
    void disabledUserStillAllowed() {
        TokenUser user = user(7L, 0L, "disabled");
        when(tokenUserDbService.lockById(7L)).thenReturn(user);
        when(tokenUserDbService.updateBalanceLi(7L, 1000L)).thenReturn(true);
        doAnswer(assignId(3L)).when(ledgerEntryDbService).insertTopup(any());

        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("topup");
        req.setAmountLi(1000L);
        req.setOperator("ops:a");
        req.setNote("补救");
        AdminAdjustmentResponse resp = app.adjust(7L, req, null);
        assertEquals(1000L, resp.getBalanceAfterLi());
        assertEquals("disabled", user.getStatus());
    }

    @Test
    void resolveSource() {
        assertEquals("wechat", AdminAdjustmentApplication.resolveSource("topup", "wechat_pay"));
        assertEquals("manual", AdminAdjustmentApplication.resolveSource("adjust", "ops:a"));
        assertNull(AdminAdjustmentApplication.resolveSource("charge", "settler"));
    }

    @Test
    void yuanFractionalLiRejected() {
        AdminAdjustmentRequest req = new AdminAdjustmentRequest();
        req.setType("topup");
        req.setAmountYuan(new BigDecimal("1.0001"));
        req.setOperator("ops:a");
        req.setNote("n");
        AdminApiException ex = assertThrows(AdminApiException.class, () -> app.adjust(1L, req, null));
        assertEquals("invalid_amount", ex.getCode());
        assertTrue(ex.getMessage().contains("whole li"));
    }

    private static TokenUser user(long id, long balance, String status) {
        TokenUser u = new TokenUser();
        u.setId(id);
        u.setBalanceLi(balance);
        u.setStatus(status);
        u.setUserCode("u_" + id);
        u.setTenantId("t1");
        return u;
    }

    private static Answer<Void> assignId(long id) {
        return invocation -> {
            TokenLedgerEntry e = invocation.getArgument(0);
            e.setId(id);
            return null;
        };
    }
}
