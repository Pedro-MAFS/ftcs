package com.mfs.tokengateway.server.settlement;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenRequestLogDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.pricing.BillingQuote;

/** 同用户合并扣减事务（独立 Bean，保证 {@code @Transactional} 生效）。 */
@Service
public class SettlementTxnService {

    private static final Logger log = LoggerFactory.getLogger(SettlementTxnService.class);

    private final TokenRequestLogDbService requestLogDbService;
    private final TokenUserDbService tokenUserDbService;
    private final TokenLedgerEntryDbService ledgerEntryDbService;

    public SettlementTxnService(
            TokenRequestLogDbService requestLogDbService,
            TokenUserDbService tokenUserDbService,
            TokenLedgerEntryDbService ledgerEntryDbService) {
        this.requestLogDbService = requestLogDbService;
        this.tokenUserDbService = tokenUserDbService;
        this.ledgerEntryDbService = ledgerEntryDbService;
    }

    @Transactional
    public void settleUserBatch(String owner, long userId, List<SettlementApplication.QuotedItem> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        List<SettlementApplication.QuotedItem> ordered = new ArrayList<>(items);
        ordered.sort(Comparator.comparing(
                i -> i.log().getCreatedAt(), Comparator.nullsLast(Comparator.naturalOrder())));

        TokenUser user = tokenUserDbService.lockById(userId);
        if (user == null) {
            throw new IllegalStateException("token_user_missing:" + userId);
        }

        long running = user.getBalanceLi() == null ? 0L : user.getBalanceLi();
        long totalDebit = 0L;
        List<TokenLedgerEntry> ledgers = new ArrayList<>(ordered.size());

        for (SettlementApplication.QuotedItem item : ordered) {
            long revenue = item.quote().revenueLi();
            running -= revenue;
            totalDebit += revenue;

            TokenLedgerEntry entry = new TokenLedgerEntry();
            entry.setUserId(userId);
            entry.setType(TokenLedgerEntryDbService.TYPE_CHARGE);
            entry.setAmountLi(-revenue);
            entry.setBalanceAfterLi(running);
            entry.setRequestId(item.log().getRequestId());
            ledgers.add(entry);
        }

        if (totalDebit != 0L) {
            if (!tokenUserDbService.updateBalanceLi(userId, running)) {
                throw new IllegalStateException("balance_update_failed:" + userId);
            }
        }

        for (TokenLedgerEntry entry : ledgers) {
            ledgerEntryDbService.insertCharge(entry);
        }

        for (SettlementApplication.QuotedItem item : ordered) {
            BillingQuote q = item.quote();
            int n = requestLogDbService.markChargedIfSettling(
                    item.log().getRequestId(), owner, q.revenueLi(), q.cogsLi(), q.marginLi());
            if (n != 1) {
                throw new IllegalStateException(
                        "mark_charged_mismatch:" + item.log().getRequestId() + " updated=" + n);
            }
        }

        log.info(
                "settlement charged userId={} count={} totalDebitLi={} balanceAfterLi={}",
                userId,
                ordered.size(),
                totalDebit,
                running);
    }
}
