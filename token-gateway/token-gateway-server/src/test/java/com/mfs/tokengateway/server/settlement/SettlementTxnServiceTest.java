package com.mfs.tokengateway.server.settlement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;
import com.mfs.tokengateway.db.po.TokenRequestLog;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.pricing.BillingQuote;
import com.mfs.tokengateway.server.pricing.PriceRuleSnapshot;
import com.mfs.tokengateway.server.pricing.UsageTokens;

@ExtendWith(MockitoExtension.class)
class SettlementTxnServiceTest {

    @Mock
    private TokenRequestLogDbService requestLogDbService;

    @Mock
    private TokenUserDbService tokenUserDbService;

    @Mock
    private TokenLedgerEntryDbService ledgerEntryDbService;

    @InjectMocks
    private SettlementTxnService txnService;

    @Test
    void mergesOneBalanceUpdateForSameUser() {
        TokenUser user = new TokenUser();
        user.setId(7L);
        user.setBalanceLi(10_000L);
        when(tokenUserDbService.lockById(7L)).thenReturn(user);
        when(tokenUserDbService.updateBalanceLi(eq(7L), anyLong())).thenReturn(true);
        when(requestLogDbService.markChargedIfSettling(anyString(), anyString(), anyLong(), anyLong(), anyLong()))
                .thenReturn(1);

        LocalDateTime t0 = LocalDateTime.of(2026, 1, 1, 0, 0);
        List<SettlementApplication.QuotedItem> items = List.of(
                item("r1", 7L, t0, 100, 10, 90),
                item("r2", 7L, t0.plusSeconds(1), 50, 5, 45),
                item("r3", 7L, t0.plusSeconds(2), 0, 0, 0));

        txnService.settleUserBatch("worker-a", 7L, items);

        verify(tokenUserDbService, times(1)).updateBalanceLi(7L, 9_850L);
        ArgumentCaptor<TokenLedgerEntry> ledgers = ArgumentCaptor.forClass(TokenLedgerEntry.class);
        verify(ledgerEntryDbService, times(3)).insertCharge(ledgers.capture());
        List<TokenLedgerEntry> all = ledgers.getAllValues();
        assertEquals(-100L, all.get(0).getAmountLi());
        assertEquals(9_900L, all.get(0).getBalanceAfterLi());
        assertEquals(-50L, all.get(1).getAmountLi());
        assertEquals(9_850L, all.get(1).getBalanceAfterLi());
        assertEquals(0L, all.get(2).getAmountLi());
        assertEquals(9_850L, all.get(2).getBalanceAfterLi());
        verify(requestLogDbService, times(3))
                .markChargedIfSettling(anyString(), eq("worker-a"), anyLong(), anyLong(), anyLong());
    }

    @Test
    void zeroOnlyBatchSkipsBalanceUpdate() {
        TokenUser user = new TokenUser();
        user.setId(1L);
        user.setBalanceLi(100L);
        when(tokenUserDbService.lockById(1L)).thenReturn(user);
        when(requestLogDbService.markChargedIfSettling(anyString(), anyString(), anyLong(), anyLong(), anyLong()))
                .thenReturn(1);

        txnService.settleUserBatch(
                "w",
                1L,
                List.of(item("z1", 1L, LocalDateTime.now(), 0, 0, 0)));

        verify(tokenUserDbService, never()).updateBalanceLi(anyLong(), anyLong());
        verify(ledgerEntryDbService).insertCharge(any());
    }

    @Test
    void rollsConceptWhenMarkChargedMismatch() {
        TokenUser user = new TokenUser();
        user.setId(1L);
        user.setBalanceLi(100L);
        when(tokenUserDbService.lockById(1L)).thenReturn(user);
        when(tokenUserDbService.updateBalanceLi(anyLong(), anyLong())).thenReturn(true);
        when(requestLogDbService.markChargedIfSettling(anyString(), anyString(), anyLong(), anyLong(), anyLong()))
                .thenReturn(0);

        assertThrows(
                IllegalStateException.class,
                () -> txnService.settleUserBatch(
                        "w",
                        1L,
                        List.of(item("x", 1L, LocalDateTime.now(), 10, 1, 9))));
    }

    private static SettlementApplication.QuotedItem item(
            String id, long userId, LocalDateTime createdAt, long rev, long cogs, long margin) {
        TokenRequestLog log = new TokenRequestLog();
        log.setRequestId(id);
        log.setUserId(userId);
        log.setCreatedAt(createdAt);
        log.setModel("deepseek-v4-flash");
        log.setPromptTokens(1);
        log.setCompletionTokens(0);
        PriceRuleSnapshot price = new PriceRuleSnapshot(
                1L, "deepseek-v4-flash", createdAt, 1, 1, 1, 1, 1);
        UsageTokens usage = new UsageTokens(1, 0, 0, 1);
        BillingQuote quote = new BillingQuote(rev, cogs, margin, usage, price);
        return new SettlementApplication.QuotedItem(log, quote);
    }
}
