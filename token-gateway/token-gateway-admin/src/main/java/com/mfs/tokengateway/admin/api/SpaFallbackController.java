package com.mfs.tokengateway.admin.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Vue Router history 模式：将前端路由回退到 {@code index.html}。
 * <p>
 * 不拦截 {@code /admin/**}、{@code /actuator/**}（由 REST / Actuator 处理）。
 */
@Controller
public class SpaFallbackController {

    @GetMapping({
            "/",
            "/dashboard",
            "/dashboard/**",
            "/ops",
            "/ops/**"
    })
    public String forward() {
        return "forward:/index.html";
    }
}
