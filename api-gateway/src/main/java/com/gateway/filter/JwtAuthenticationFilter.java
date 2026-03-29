package com.gateway.filter;

import com.gateway.model.RequestLog;
import com.gateway.model.User;
import com.gateway.repository.RequestLogRepository;
import com.gateway.service.RateLimiterService;
import com.gateway.service.UserDetailsServiceImpl;
import com.gateway.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserDetailsServiceImpl userDetailsService;
    private final RateLimiterService rateLimiterService;
    private final RequestLogRepository requestLogRepository;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        long startTime = System.currentTimeMillis();
        String path = request.getRequestURI();

        // Skip auth endpoints
        if (path.startsWith("/auth/")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String authHeader = request.getHeader("Authorization");
        String username = null;
        String jwt = null;

        // Extract JWT from Bearer header
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            jwt = authHeader.substring(7);
            try {
                username = jwtUtil.extractUsername(jwt);
            } catch (Exception e) {
                log.warn("Invalid JWT token: {}", e.getMessage());
                sendError(response, HttpStatus.UNAUTHORIZED, "Invalid token");
                logRequest(request, null, HttpStatus.UNAUTHORIZED.value(),
                        System.currentTimeMillis() - startTime, false, true, "Invalid token");
                return;
            }
        }

        if (username == null) {
            sendError(response, HttpStatus.UNAUTHORIZED, "Missing Authorization header");
            logRequest(request, null, HttpStatus.UNAUTHORIZED.value(),
                    System.currentTimeMillis() - startTime, false, false, "No token");
            return;
        }

        // Validate token and load user
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails userDetails;
            User userEntity;
            try {
                userDetails = userDetailsService.loadUserByUsername(username);
                userEntity = userDetailsService.loadUserEntity(username);
            } catch (Exception e) {
                sendError(response, HttpStatus.UNAUTHORIZED, "User not found");
                return;
            }

            if (!jwtUtil.isTokenValid(jwt, userDetails)) {
                sendError(response, HttpStatus.UNAUTHORIZED, "Token expired or invalid");
                logRequest(request, username, HttpStatus.UNAUTHORIZED.value(),
                        System.currentTimeMillis() - startTime, false, true, "Token expired");
                return;
            }

            // ── Rate Limiting ──────────────────────────────────────
            if (!rateLimiterService.isAllowed(userEntity)) {
                log.warn("Rate limit exceeded for user={}", username);
                response.setHeader("X-RateLimit-Status", "exceeded");
                sendError(response, HttpStatus.TOO_MANY_REQUESTS, "Rate limit exceeded");
                logRequest(request, username, HttpStatus.TOO_MANY_REQUESTS.value(),
                        System.currentTimeMillis() - startTime, true, true, "Rate limited");
                return;
            }

            // Set authentication in security context
            UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                    userDetails, null, userDetails.getAuthorities()
            );
            authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authToken);

            // Add rate limit headers
            RateLimiterService.RateLimitStatus status = rateLimiterService.getStatus(userEntity.getId());
            if (status.getTokenBucketTokens() >= 0) {
                response.setHeader("X-RateLimit-Remaining", String.valueOf(status.getTokenBucketTokens()));
                response.setHeader("X-RateLimit-Limit", String.valueOf(status.getTokenBucketCapacity()));
            }
        }

        // Continue request and log
        filterChain.doFilter(request, response);
        logRequest(request, username, response.getStatus(),
                System.currentTimeMillis() - startTime, false, true, null);
    }

    private void sendError(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + message + "\",\"status\":" + status.value() + "}");
    }

    private void logRequest(HttpServletRequest request, String username, int status,
                             long responseTime, boolean rateLimited, boolean authenticated, String errorMsg) {
        try {
            RequestLog log = RequestLog.builder()
                    .username(username)
                    .method(request.getMethod())
                    .path(request.getRequestURI())
                    .targetService(resolveService(request.getRequestURI()))
                    .statusCode(status)
                    .responseTimeMs(responseTime)
                    .clientIp(getClientIp(request))
                    .userAgent(request.getHeader("User-Agent"))
                    .rateLimited(rateLimited)
                    .authenticated(authenticated)
                    .timestamp(Instant.now())
                    .errorMessage(errorMsg)
                    .build();
            requestLogRepository.save(log);
        } catch (Exception e) {
            // Don't let logging failure affect request
        }
    }

    private String resolveService(String path) {
        if (path.startsWith("/api/users")) return "user-service";
        if (path.startsWith("/api/orders")) return "order-service";
        if (path.startsWith("/api/products")) return "product-service";
        return "unknown";
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        return xForwardedFor != null ? xForwardedFor.split(",")[0].trim() : request.getRemoteAddr();
    }
}
