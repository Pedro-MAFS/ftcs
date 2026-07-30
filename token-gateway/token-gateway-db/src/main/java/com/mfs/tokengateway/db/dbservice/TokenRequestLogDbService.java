package com.mfs.tokengateway.db.dbservice;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mfs.tokengateway.db.mapper.TokenRequestLogMapper;
import com.mfs.tokengateway.db.po.TokenRequestLog;

/** {@code token_request_logs} 持久化（US-G0-09 计量落库）。 */
@Service
public class TokenRequestLogDbService extends ServiceImpl<TokenRequestLogMapper, TokenRequestLog> {

    /** 按主键插入；调用方保证 {@code request_id} 唯一。 */
    public void insertLog(TokenRequestLog log) {
        save(log);
    }
}
