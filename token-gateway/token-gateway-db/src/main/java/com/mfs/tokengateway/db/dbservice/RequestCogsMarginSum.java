package com.mfs.tokengateway.db.dbservice;

/** 请求日志成本/毛利合计（US-G6-02 看板副指标）。 */
public class RequestCogsMarginSum {

    private long cogsLi;
    private long marginLi;

    public RequestCogsMarginSum() {}

    public RequestCogsMarginSum(long cogsLi, long marginLi) {
        this.cogsLi = cogsLi;
        this.marginLi = marginLi;
    }

    public long getCogsLi() {
        return cogsLi;
    }

    public void setCogsLi(long cogsLi) {
        this.cogsLi = cogsLi;
    }

    public long getMarginLi() {
        return marginLi;
    }

    public void setMarginLi(long marginLi) {
        this.marginLi = marginLi;
    }
}
