package com.mfs.tokengateway.server.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import com.mfs.tokengateway.db.dbservice.TokenUserDbService;
import com.mfs.tokengateway.db.po.TokenUser;
import com.mfs.tokengateway.server.config.TokenGatewayProperties;
import com.mfs.tokengateway.server.security.RechargeCaller;
import com.mfs.tokengateway.server.security.RechargeTicketAuthService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 网关托管用户面板入口（US-G4-01）：复用充值 ticket / Cookie，验票后注入 bootstrap。
 */
@Controller
public class BillingPortalPageController {

    private static final Logger log = LoggerFactory.getLogger(BillingPortalPageController.class);

    static final String PAGE_PATH = "/billing/portal";
    private static final String TEMPLATE = "templates/billing/portal.html";
    private static final String BOOTSTRAP_PLACEHOLDER = "__TG_PORTAL_BOOTSTRAP__";

    private final RechargeTicketAuthService ticketAuthService;
    private final TokenUserDbService tokenUserDbService;
    private final TokenGatewayProperties properties;
    private final String htmlTemplate;

    public BillingPortalPageController(
            RechargeTicketAuthService ticketAuthService,
            TokenUserDbService tokenUserDbService,
            TokenGatewayProperties properties)
            throws IOException {
        this.ticketAuthService = ticketAuthService;
        this.tokenUserDbService = tokenUserDbService;
        this.properties = properties;
        this.htmlTemplate = loadTemplate();
    }

    @GetMapping({"/billing/portal", "/billing/portal/"})
    public void page(
            @RequestParam(value = "ticket", required = false) String ticket,
            @CookieValue(name = RechargeCaller.COOKIE_NAME, required = false) String cookieTicket,
            HttpServletRequest request,
            HttpServletResponse response)
            throws IOException {

        if (ticket != null && !ticket.isBlank()) {
            String raw = ticket.trim();
            Optional<RechargeCaller> resolved = ticketAuthService.resolve(raw);
            if (resolved.isPresent()) {
                RechargeCaller caller = resolved.get();
                ticketAuthService.touchLastUsed(caller);
                BillingRechargePageController.writeTicketCookie(
                        response, raw, caller.remainingSeconds(Instant.now()), request.isSecure());
                log.info(
                        "portal page bind ok tenantId={} userCode={} ticketPrefix={}",
                        caller.getTenantId(),
                        caller.getUserCode(),
                        raw.length() >= 8 ? raw.substring(0, 8) : raw);
                response.setStatus(HttpServletResponse.SC_FOUND);
                response.setHeader(HttpHeaders.LOCATION, PAGE_PATH);
                return;
            }
            BillingRechargePageController.clearTicketCookie(response, request.isSecure());
            log.info(
                    "portal page bind rejected ticketPrefix={}",
                    raw.length() >= 8 ? raw.substring(0, 8) : raw);
            response.setStatus(HttpServletResponse.SC_FOUND);
            response.setHeader(HttpHeaders.LOCATION, PAGE_PATH);
            return;
        }

        boolean ok = false;
        long expiresIn = 0L;
        Long balanceLi = null;
        String reason = "missing";
        if (cookieTicket != null && !cookieTicket.isBlank()) {
            Optional<RechargeCaller> resolved = ticketAuthService.resolve(cookieTicket);
            if (resolved.isPresent()) {
                RechargeCaller caller = resolved.get();
                ok = true;
                expiresIn = caller.remainingSeconds(Instant.now());
                balanceLi = lookupBalanceLi(caller);
                reason = null;
            } else {
                BillingRechargePageController.clearTicketCookie(response, request.isSecure());
                reason = "expired";
            }
        }

        String bootstrap =
                buildBootstrapJson(ok, expiresIn, balanceLi, configuredTicketTtlSeconds(), reason);
        String html = htmlTemplate.replace(BOOTSTRAP_PLACEHOLDER, bootstrap);
        response.setStatus(HttpServletResponse.SC_OK);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("text/html;charset=UTF-8");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.getWriter().write(html);
    }

    private long configuredTicketTtlSeconds() {
        return Math.max(1L, properties.getBilling().getRechargeTicketTtl().toSeconds());
    }

    private Long lookupBalanceLi(RechargeCaller caller) {
        TokenUser user = null;
        if (caller.getUserId() != null) {
            user = tokenUserDbService.getById(caller.getUserId());
        }
        if (user == null) {
            user = tokenUserDbService.findByTenantIdAndUserCode(
                    caller.getTenantId(), caller.getUserCode());
        }
        if (user == null) {
            return 0L;
        }
        return user.getBalanceLi() == null ? 0L : user.getBalanceLi();
    }

    static String buildBootstrapJson(
            boolean ok, long expiresIn, Long balanceLi, long ticketTtlSeconds, String reason) {
        StringBuilder sb = new StringBuilder(160);
        sb.append("{\"ok\":").append(ok);
        sb.append(",\"expires_in\":").append(expiresIn);
        sb.append(",\"ticket_ttl_seconds\":").append(ticketTtlSeconds);
        if (ok && balanceLi != null) {
            sb.append(",\"balance_li\":").append(balanceLi);
        }
        if (!ok && reason != null && !reason.isBlank()) {
            sb.append(",\"reason\":\"").append(escapeJson(reason)).append('"');
        }
        sb.append('}');
        return sb.toString();
    }

    private static String escapeJson(String raw) {
        return raw.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String loadTemplate() throws IOException {
        ClassPathResource resource = new ClassPathResource(TEMPLATE);
        try (InputStream in = resource.getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
