package com.mfs.tokengateway.db.dbservice;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenLedgerEntryMapper;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;

/** {@code token_ledger_entries}（G0-10 charge）。 */
@Service
public class TokenLedgerEntryDbService extends ServiceImpl<TokenLedgerEntryMapper, TokenLedgerEntry> {

    public static final String TYPE_CHARGE = "charge";

    public void insertCharge(TokenLedgerEntry entry) {
        save(entry);
    }
}
