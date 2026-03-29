package com.gateway.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Enumeration;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api")
public class GatewayController {

    private final RestTemplate restTemplate;

    @Value("${services.user-service.url}")
    private String userServiceUrl;

    @Value("${services.order-service.url}")
    private String orderServiceUrl;

    @Value("${services.product-service.url}")
    private String productServiceUrl;

    public GatewayController() {
        this.restTemplate = new RestTemplate();
    }

    // ── User Service Routes ─────────────────────────────────────
    @RequestMapping("/users/**")
    public ResponseEntity<?> proxyUserService(
            HttpServletRequest request,
            @RequestBody(required = false) String body) {
        return proxy(request, body, userServiceUrl, "/api/users");
    }

    // ── Order Service Routes ────────────────────────────────────
    @RequestMapping("/orders/**")
    public ResponseEntity<?> proxyOrderService(
            HttpServletRequest request,
            @RequestBody(required = false) String body) {
        return proxy(request, body, orderServiceUrl, "/api/orders");
    }

    // ── Product Service Routes ──────────────────────────────────
    @RequestMapping("/products/**")
    public ResponseEntity<?> proxyProductService(
            HttpServletRequest request,
            @RequestBody(required = false) String body) {
        return proxy(request, body, productServiceUrl, "/api/products");
    }

    private ResponseEntity<?> proxy(HttpServletRequest request, String body,
                                     String serviceUrl, String stripPrefix) {
        String path = request.getRequestURI().replace(stripPrefix, "");
        String queryString = request.getQueryString();
        String targetUrl = serviceUrl + path + (queryString != null ? "?" + queryString : "");

        HttpHeaders headers = copyHeaders(request);
        HttpEntity<String> entity = new HttpEntity<>(body, headers);
        HttpMethod method = HttpMethod.valueOf(request.getMethod());

        log.debug("Proxying {} {} → {}", method, request.getRequestURI(), targetUrl);

        try {
            return restTemplate.exchange(targetUrl, method, entity, String.class);
        } catch (HttpClientErrorException e) {
            return ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Proxy error for {}: {}", targetUrl, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "Service unavailable", "service", serviceUrl));
        }
    }

    private HttpHeaders copyHeaders(HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        Enumeration<String> headerNames = request.getHeaderNames();
        while (headerNames.hasMoreElements()) {
            String name = headerNames.nextElement();
            // Skip hop-by-hop headers
            if (!name.equalsIgnoreCase("host") && !name.equalsIgnoreCase("authorization")) {
                headers.set(name, request.getHeader(name));
            }
        }
        return headers;
    }
}
