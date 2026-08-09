package com.mfs.tokengateway.admin.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.mfs.tokengateway.admin.api.dto.AdminAdjustmentRequest;
import com.mfs.tokengateway.admin.api.dto.AdminAdjustmentResponse;
import com.mfs.tokengateway.admin.domain.AdminApiException;
import com.mfs.tokengateway.admin.utils.AdminMoney;
import com.mfs.tokengateway.db.dbservice.TokenLedgerEntryDbService;
import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenLedgerEntry;
import com.mfs.tokengateway.db.po.TokenUser;

/** 人工 topup / adjust（US-G6-07）。 */
@Service
public class AdminAdjustmentApplication {

    private static final Logger log = LoggerFactory.getLogger(AdminAdjustmentApplication.class);

    public static final String OPERATOR_WECHAT_PAY = "wechat_pay";
    public static final String SOURCE_MANUAL = "manual";
    public static final String SOURCE_WECHAT = "wechat";

    static final long MAX_ABS_AMOUNT_LI = 100_000_000L; // 10 万元

    private final TokenUserDbService tokenUserDbService;
    private final TokenLedgerEntryDbService ledgerEntryDbService;

    public AdminAdjustmentApplication(
            TokenUserDbService tokenUserDbService, TokenLedgerEntryDbService ledgerEntryDbService) {
        this.tokenUserDbService = tokenUserDbService;
        this.ledgerEntryDbService = ledgerEntryDbService;
    }

    @Transactional
    public AdminAdjustmentResponse adjust(long userId, AdminAdjustmentRequest req, String clientIp) {
        if (req == null) {
            throw AdminApiException.badRequest("validation_error", "body is required");
        }
        String type = normalizeType(req.getType());
        long amountLi = resolveAmountLi(req, type);
        String operator = normalizeOperator(req.getOperator());
        String note = normalizeNote(req.getNote());

        TokenUser user = tokenUserDbService.lockById(userId);
        if (user == null) {
            throw AdminApiException.notFound("user_not_found", "user not found: " + userId);
        }

        long before = user.getBalanceLi() == null ? 0L : user.getBalanceLi();
        long after = before + amountLi;
        if (after < 0) {
            throw AdminApiException.badRequest(
                    "balance_would_be_negative",
                    "adjustment would make balance negative");
        }

        if (!tokenUserDbService.updateBalanceLi(userId, after)) {
            throw AdminApiException.internalError(
                    "balance_update_failed", "failed to update balance for user " + userId);
        }

        LocalDateTime now = LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
        TokenLedgerEntry entry = new TokenLedgerEntry();
        entry.setUserId(userId);
        entry.setAmountLi(amountLi);
        entry.setBalanceAfterLi(after);
        entry.setRequestId(null);
        entry.setOperator(operator);
        entry.setNote(note);
        entry.setCreatedAt(now);
        if (TokenLedgerEntryDbService.TYPE_TOPUP.equals(type)) {
            ledgerEntryDbService.insertTopup(entry);
        } else {
            ledgerEntryDbService.insertAdjust(entry);
        }

        log.info(
                "AUDIT adjustment user_id={} type={} amount_li={} before={} after={} ledger_id={} operator={} note={} ip={}",
                userId,
                type,
                amountLi,
                before,
                after,
                entry.getId(),
                operator,
                note,
                clientIp == null ? "" : clientIp);

        AdminAdjustmentResponse resp = new AdminAdjustmentResponse();
        resp.setUserId(userId);
        resp.setUserCode(user.getUserCode());
        resp.setTenantId(user.getTenantId());
        resp.setLedgerId(entry.getId());
        resp.setType(type);
        resp.setAmountLi(amountLi);
        resp.setAmountYuan(AdminMoney.liToYuan(amountLi));
        resp.setBalanceBeforeLi(before);
        resp.setBalanceBeforeYuan(AdminMoney.liToYuan(before));
        resp.setBalanceAfterLi(after);
        resp.setBalanceAfterYuan(AdminMoney.liToYuan(after));
        resp.setOperator(operator);
        resp.setNote(note);
        resp.setSource(SOURCE_MANUAL);
        resp.setCreatedAt(now.toInstant(ZoneOffset.UTC));
        return resp;
    }

    static String normalizeType(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw AdminApiException.badRequest("validation_error", "type is required");
        }
        String t = raw.trim().toLowerCase(Locale.ROOT);
        if (!TokenLedgerEntryDbService.TYPE_TOPUP.equals(t)
                && !TokenLedgerEntryDbService.TYPE_ADJUST.equals(t)) {
            throw AdminApiException.badRequest(
                    "validation_error", "type must be topup or adjust");
        }
        return t;
    }

    static String normalizeOperator(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw AdminApiException.badRequest("validation_error", "operator is required");
        }
        String op = raw.trim();
        if (op.isEmpty() || op.length() > 128) {
            throw AdminApiException.badRequest(
                    "validation_error", "operator length must be 1..128");
        }
        if (OPERATOR_WECHAT_PAY.equalsIgnoreCase(op)) {
            throw AdminApiException.badRequest(
                    "reserved_operator", "operator wechat_pay is reserved");
        }
        return op;
    }

    static String normalizeNote(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw AdminApiException.badRequest("validation_error", "note is required");
        }
        String note = raw.trim();
        if (note.isEmpty() || note.length() > 512) {
            throw AdminApiException.badRequest(
                    "validation_error", "note length must be 1..512");
        }
        return note;
    }

    static long resolveAmountLi(AdminAdjustmentRequest req, String type) {
        Long li = req.getAmountLi();
        BigDecimal yuan = req.getAmountYuan();
        boolean hasLi = li != null;
        boolean hasYuan = yuan != null;

        if (!hasLi && !hasYuan) {
            throw AdminApiException.badRequest(
                    "invalid_amount", "amount_li or amount_yuan is required");
        }

        long amount;
        if (hasLi && hasYuan) {
            long fromYuan;
            try {
                fromYuan = AdminMoney.yuanToLiExact(yuan);
            } catch (ArithmeticException e) {
                throw AdminApiException.badRequest(
                        "invalid_amount", "amount_yuan must be whole li (0.001 yuan)");
            }
            if (fromYuan != li.longValue()) {
                throw AdminApiException.badRequest(
                        "invalid_amount", "amount_li and amount_yuan conflict");
            }
            amount = li.longValue();
        } else if (hasYuan) {
            try {
                amount = AdminMoney.yuanToLiExact(yuan);
            } catch (ArithmeticException e) {
                throw AdminApiException.badRequest(
                        "invalid_amount", "amount_yuan must be whole li (0.001 yuan)");
            }
        } else {
            amount = li.longValue();
        }

        if (Math.abs(amount) > MAX_ABS_AMOUNT_LI) {
            throw AdminApiException.badRequest(
                    "amount_too_large", "absolute amount must be <= 100000000 li (100000 yuan)");
        }

        if (TokenLedgerEntryDbService.TYPE_TOPUP.equals(type)) {
            if (amount <= 0) {
                throw AdminApiException.badRequest(
                        "invalid_amount", "topup amount_li must be > 0");
            }
        } else if (amount == 0) {
            throw AdminApiException.badRequest(
                    "invalid_amount", "adjust amount_li must be non-zero");
        }
        return amount;
    }

    /** 列表展示用：topup/adjust → wechat|manual；charge → null。 */
    public static String resolveSource(String type, String operator) {
        if (type == null) {
            return null;
        }
        String t = type.trim().toLowerCase(Locale.ROOT);
        if (!TokenLedgerEntryDbService.TYPE_TOPUP.equals(t)
                && !TokenLedgerEntryDbService.TYPE_ADJUST.equals(t)) {
            return null;
        }
        if (operator != null && OPERATOR_WECHAT_PAY.equalsIgnoreCase(operator.trim())) {
            return SOURCE_WECHAT;
        }
        return SOURCE_MANUAL;
    }
}
