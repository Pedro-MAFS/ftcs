package com.mfs.tokengateway.admin.application;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.mfs.tokengateway.admin.api.dto.AdminPriceCreateRequest;
import com.mfs.tokengateway.admin.api.dto.AdminPriceListResponse;
import com.mfs.tokengateway.admin.api.dto.AdminPriceListResponse.AdminPriceItem;
import com.mfs.tokengateway.admin.config.AdminProperties;
import com.mfs.tokengateway.admin.domain.price.AdminPriceException;
import com.mfs.tokengateway.admin.domain.price.PriceBillingUnit;
import com.mfs.tokengateway.admin.domain.price.PriceEncoding;
import com.mfs.tokengateway.db.dbservice.TokenPriceRuleDbService;
import com.mfs.tokengateway.db.po.TokenPriceRule;

/** 价目列表 / 时间线 / INSERT（US-G6-10）。 */
@Service
public class AdminPriceApplication {

    private static final Logger log = LoggerFactory.getLogger(AdminPriceApplication.class);

    public static final String STATUS_CURRENT = "current";
    public static final String STATUS_HISTORY = "history";
    public static final String STATUS_SCHEDULED = "scheduled";

    private final TokenPriceRuleDbService priceRuleDbService;
    private final AdminProperties adminProperties;

    public AdminPriceApplication(
            TokenPriceRuleDbService priceRuleDbService, AdminProperties adminProperties) {
        this.priceRuleDbService = priceRuleDbService;
        this.adminProperties = adminProperties;
    }

    public AdminPriceListResponse list(
            String modelFilter,
            boolean includeHistory,
            boolean includeScheduled,
            Instant asOf) {
        Instant effectiveAsOf = asOf != null ? asOf : Instant.now();
        LocalDateTime asOfUtc = PriceEncoding.toUtcLocalDateTime(effectiveAsOf);
        Set<String> allowed = adminProperties.allowedPriceModels();

        List<TokenPriceRule> rows;
        if (modelFilter != null && !modelFilter.isBlank()) {
            String model = modelFilter.trim();
            requireAllowed(model);
            rows = priceRuleDbService.listByModelOrderByFromDesc(model);
        } else {
            rows = priceRuleDbService.listAllOrderByModelFromDesc().stream()
                    .filter(r -> allowed.contains(r.getModel()))
                    .toList();
        }

        List<AdminPriceItem> items = annotateAndFilter(rows, asOfUtc, includeHistory, includeScheduled);
        AdminPriceListResponse resp = new AdminPriceListResponse();
        resp.setAsOf(effectiveAsOf);
        resp.setItems(items);
        return resp;
    }

    public AdminPriceListResponse timeline(String model, Instant asOf) {
        requireAllowed(model);
        Instant effectiveAsOf = asOf != null ? asOf : Instant.now();
        LocalDateTime asOfUtc = PriceEncoding.toUtcLocalDateTime(effectiveAsOf);
        List<TokenPriceRule> rows = priceRuleDbService.listByModelOrderByFromDesc(model);
        List<AdminPriceItem> items = annotateAndFilter(rows, asOfUtc, true, true);
        AdminPriceListResponse resp = new AdminPriceListResponse();
        resp.setAsOf(effectiveAsOf);
        resp.setItems(items);
        return resp;
    }

    public AdminPriceItem create(AdminPriceCreateRequest req, String clientInfo) {
        requireAllowed(req.getModel() != null ? req.getModel().trim() : null);
        if (req.getOperator() == null || req.getOperator().isBlank()) {
            throw AdminPriceException.badRequest("validation_error", "operator is required");
        }
        if (req.getNote() == null || req.getNote().isBlank()) {
            throw AdminPriceException.badRequest("validation_error", "note is required");
        }

        TokenPriceRule row = PriceEncoding.toRow(req);
        try {
            boolean ok = priceRuleDbService.insertNew(row);
            if (!ok) {
                throw AdminPriceException.badRequest("validation_error", "insert failed");
            }
        } catch (DataIntegrityViolationException ex) {
            throw AdminPriceException.conflict(
                    "price_version_conflict",
                    "price version already exists for model+effective_from");
        }

        Instant now = Instant.now();
        LocalDateTime asOfUtc = PriceEncoding.toUtcLocalDateTime(now);
        List<TokenPriceRule> timeline =
                priceRuleDbService.listByModelOrderByFromDesc(row.getModel());
        AdminPriceItem item = annotateAndFilter(timeline, asOfUtc, true, true).stream()
                .filter(i -> row.getId() != null && row.getId().equals(i.getId()))
                .findFirst()
                .orElseGet(() -> toItem(row, STATUS_CURRENT));

        log.info(
                "AUDIT price_insert operator={} note={} id={} model={} effective_from={} "
                        + "input={} output={} up_in={} up_cache={} up_out={} billing_unit={} client={}",
                req.getOperator().trim(),
                req.getNote().trim(),
                row.getId(),
                row.getModel(),
                row.getEffectiveFrom(),
                row.getInputPriceLiPerMTok(),
                row.getOutputPriceLiPerMTok(),
                row.getUpstreamInputCostLiPerMTok(),
                row.getUpstreamCacheCostLiPerMTok(),
                row.getUpstreamOutputCostLiPerMTok(),
                item.getBillingUnit(),
                clientInfo != null ? clientInfo : "-");

        return item;
    }

    private List<AdminPriceItem> annotateAndFilter(
            List<TokenPriceRule> rows,
            LocalDateTime asOfUtc,
            boolean includeHistory,
            boolean includeScheduled) {
        Map<String, List<TokenPriceRule>> byModel = new LinkedHashMap<>();
        for (TokenPriceRule row : rows) {
            byModel.computeIfAbsent(row.getModel(), k -> new ArrayList<>()).add(row);
        }

        List<AdminPriceItem> out = new ArrayList<>();
        for (Map.Entry<String, List<TokenPriceRule>> e : byModel.entrySet()) {
            List<TokenPriceRule> modelRows = new ArrayList<>(e.getValue());
            modelRows.sort(Comparator.comparing(TokenPriceRule::getEffectiveFrom).reversed());

            boolean currentAssigned = false;
            for (TokenPriceRule row : modelRows) {
                boolean scheduled = row.getEffectiveFrom().isAfter(asOfUtc);
                String status;
                if (scheduled) {
                    status = STATUS_SCHEDULED;
                } else if (!currentAssigned) {
                    status = STATUS_CURRENT;
                    currentAssigned = true;
                } else {
                    status = STATUS_HISTORY;
                }

                if (!includeHistory) {
                    if (STATUS_CURRENT.equals(status)) {
                        out.add(toItem(row, status));
                    }
                    continue;
                }
                if (STATUS_SCHEDULED.equals(status) && !includeScheduled) {
                    continue;
                }
                out.add(toItem(row, status));
            }
        }
        return out;
    }

    AdminPriceItem toItem(TokenPriceRule row, String status) {
        AdminPriceItem item = new AdminPriceItem();
        item.setId(row.getId());
        item.setModel(row.getModel());
        PriceBillingUnit unit = PriceEncoding.billingUnitForModel(row.getModel());
        item.setBillingUnit(unit.wire());
        item.setStatus(status);
        item.setEffectiveFrom(PriceEncoding.toInstant(row.getEffectiveFrom()));
        item.setCreatedAt(PriceEncoding.toInstant(row.getCreatedAt()));

        long in = nz(row.getInputPriceLiPerMTok());
        long out = nz(row.getOutputPriceLiPerMTok());
        long upIn = nz(row.getUpstreamInputCostLiPerMTok());
        long upCache = nz(row.getUpstreamCacheCostLiPerMTok());
        long upOut = nz(row.getUpstreamOutputCostLiPerMTok());

        item.setInputPriceLiPerMtok(in);
        item.setOutputPriceLiPerMtok(out);
        item.setUpstreamInputCostLiPerMtok(upIn);
        item.setUpstreamCacheCostLiPerMtok(upCache);
        item.setUpstreamOutputCostLiPerMtok(upOut);

        if (unit == PriceBillingUnit.PER_CALL) {
            long priceLi = PriceEncoding.storedToLiPerCall(in);
            long cogsLi = PriceEncoding.storedToLiPerCall(upIn);
            item.setPriceLiPerCall(priceLi);
            item.setCogsLiPerCall(cogsLi);
            item.setPriceYuanPerCall(PriceEncoding.liToYuan(priceLi));
            item.setCogsYuanPerCall(PriceEncoding.liToYuan(cogsLi));
        } else {
            item.setInputPriceYuanPerMtok(PriceEncoding.liToYuan(in));
            item.setOutputPriceYuanPerMtok(PriceEncoding.liToYuan(out));
            item.setUpstreamInputCostYuanPerMtok(PriceEncoding.liToYuan(upIn));
            item.setUpstreamCacheCostYuanPerMtok(PriceEncoding.liToYuan(upCache));
            item.setUpstreamOutputCostYuanPerMtok(PriceEncoding.liToYuan(upOut));
        }
        return item;
    }

    private void requireAllowed(String model) {
        if (model == null || model.isBlank()) {
            throw AdminPriceException.badRequest("validation_error", "model is required");
        }
        if (!adminProperties.allowedPriceModels().contains(model)) {
            throw AdminPriceException.badRequest(
                    "model_not_allowed", "model is not in admin price allowlist: " + model);
        }
    }

    private static long nz(Long v) {
        return v != null ? v : 0L;
    }
}
