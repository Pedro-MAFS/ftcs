package com.mfs.tokengateway.db.dbservice;

/** 看板按日聚合行（US-G6-02；day_sh = Asia/Shanghai 日历日 YYYY-MM-DD）。 */
public class DashboardDayAgg {

    private String daySh;
    private Long amountLi;
    private Long cnt;
    private Long users;

    public String getDaySh() {
        return daySh;
    }

    public void setDaySh(String daySh) {
        this.daySh = daySh;
    }

    public Long getAmountLi() {
        return amountLi;
    }

    public void setAmountLi(Long amountLi) {
        this.amountLi = amountLi;
    }

    public Long getCnt() {
        return cnt;
    }

    public void setCnt(Long cnt) {
        this.cnt = cnt;
    }

    public Long getUsers() {
        return users;
    }

    public void setUsers(Long users) {
        this.users = users;
    }
}
