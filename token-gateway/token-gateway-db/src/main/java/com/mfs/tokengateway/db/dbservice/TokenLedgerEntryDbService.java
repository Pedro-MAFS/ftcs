package com.mfs.tokengateway.db.dbservice;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenLedgerEntryMapper;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;

/** {@code token_ledger_entries}（G0-10 charge；G3-02 topup）。 */
@Service
public class TokenLedgerEntryDbService extends ServiceImpl<TokenLedgerEntryMapper, TokenLedgerEntry> {

    public static final String TYPE_CHARGE = "charge";
    public static final String TYPE_TOPUP = "topup";

    public void insertCharge(TokenLedgerEntry entry) {
        save(entry);
    }

    public void insertTopup(TokenLedgerEntry entry) {
        entry.setType(TYPE_TOPUP);
        save(entry);
    }
}
