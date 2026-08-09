package com.mfs.tokengateway.db.dbservice;

/** ledger 金额合计 + 笔数（US-G6-02）。 */
public class LedgerAmountCount {

    private long amountLi;
    private long count;

    public LedgerAmountCount() {}

    public LedgerAmountCount(long amountLi, long count) {
        this.amountLi = amountLi;
        this.count = count;
    }

    public long getAmountLi() {
        return amountLi;
    }

    public void setAmountLi(long amountLi) {
        this.amountLi = amountLi;
    }

    public long getCount() {
        return count;
    }

    public void setCount(long count) {
        this.count = count;
    }
}
