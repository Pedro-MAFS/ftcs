package com.mfs.tokengateway.server.billing;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
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
 * 网关托管充值页入口（US-G3-06）：验票、Set-Cookie、去掉 query、注入页内 bootstrap。
 * <p>
 * 不做独立 {@code /session} JSON；无有效凭证时页内直接展示 NeedClient。
 * 有效凭证时 bootstrap 可带 {@code balance_li}（来自 token_users）。
 */
@Controller
public class BillingRechargePageController {

    private static final Logger log = LoggerFactory.getLogger(BillingRechargePageController.class);

    static final String PAGE_PATH = "/billing/recharge";
    /** 非 static，避免未经注入的模板被直接访问。 */
    private static final String TEMPLATE = "templates/billing/recharge.html";
    private static final String BOOTSTRAP_PLACEHOLDER = "__TG_RECHARGE_BOOTSTRAP__";

    private final RechargeTicketAuthService ticketAuthService;
    private final TokenUserDbService tokenUserDbService;
    private final TokenGatewayProperties properties;
    private final String htmlTemplate;

    public BillingRechargePageController(
            RechargeTicketAuthService ticketAuthService,
            TokenUserDbService tokenUserDbService,
            TokenGatewayProperties properties)
            throws IOException {
        this.ticketAuthService = ticketAuthService;
        this.tokenUserDbService = tokenUserDbService;
        this.properties = properties;
        this.htmlTemplate = loadTemplate();
    }

    @GetMapping({"/billing/recharge", "/billing/recharge/"})
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
                writeTicketCookie(response, raw, caller.remainingSeconds(Instant.now()), request.isSecure());
                log.info(
                        "recharge page bind ok tenantId={} userCode={} ticketPrefix={}",
                        caller.getTenantId(),
                        caller.getUserCode(),
                        raw.length() >= 8 ? raw.substring(0, 8) : raw);
                response.setStatus(HttpServletResponse.SC_FOUND);
                response.setHeader(HttpHeaders.LOCATION, PAGE_PATH);
                return;
            }
            clearTicketCookie(response, request.isSecure());
            log.info(
                    "recharge page bind rejected ticketPrefix={}",
                    raw.length() >= 8 ? raw.substring(0, 8) : raw);
            response.setStatus(HttpServletResponse.SC_FOUND);
            response.setHeader(HttpHeaders.LOCATION, PAGE_PATH);
            return;
        }

        boolean ok = false;
        long expiresIn = 0L;
        Long balanceLi = null;
        if (cookieTicket != null && !cookieTicket.isBlank()) {
            Optional<RechargeCaller> resolved = ticketAuthService.resolve(cookieTicket);
            if (resolved.isPresent()) {
                RechargeCaller caller = resolved.get();
                ok = true;
                expiresIn = caller.remainingSeconds(Instant.now());
                balanceLi = lookupBalanceLi(caller);
            } else {
                clearTicketCookie(response, request.isSecure());
            }
        }

        String bootstrap = buildBootstrapJson(ok, expiresIn, balanceLi, configuredTicketTtlSeconds());
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

    static String buildBootstrapJson(boolean ok, long expiresIn, Long balanceLi, long ticketTtlSeconds) {
        StringBuilder sb = new StringBuilder(128);
        sb.append("{\"ok\":").append(ok);
        sb.append(",\"expires_in\":").append(expiresIn);
        sb.append(",\"ticket_ttl_seconds\":").append(ticketTtlSeconds);
        if (ok && balanceLi != null) {
            sb.append(",\"balance_li\":").append(balanceLi);
        }
        sb.append('}');
        return sb.toString();
    }

    static void writeTicketCookie(
            HttpServletResponse response, String rawTicket, long maxAgeSeconds, boolean secure) {
        long maxAge = Math.max(1L, maxAgeSeconds);
        ResponseCookie cookie = ResponseCookie.from(RechargeCaller.COOKIE_NAME, rawTicket)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    static void clearTicketCookie(HttpServletResponse response, boolean secure) {
        ResponseCookie cookie = ResponseCookie.from(RechargeCaller.COOKIE_NAME, "")
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path("/")
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private static String loadTemplate() throws IOException {
        ClassPathResource resource = new ClassPathResource(TEMPLATE);
        try (InputStream in = resource.getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
