package com.gateway.controller;

import com.gateway.model.RequestLog;
import com.gateway.model.User;
import com.gateway.repository.RequestLogRepository;
import com.gateway.repository.UserRepository;
import com.gateway.service.RateLimiterService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/admin")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminController {

    private final RequestLogRepository requestLogRepository;
    private final UserRepository userRepository;
    private final RateLimiterService rateLimiterService;

    /**
     * GET /admin/dashboard
     * Summary stats for the last 24 hours.
     */
    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getDashboard() {
        Instant from = Instant.now().minus(24, ChronoUnit.HOURS);
        Instant to = Instant.now();

        long totalRequests = requestLogRepository.countByTimestampBetween(from, to);
        long rateLimited = requestLogRepository.countByRateLimitedTrueAndTimestampBetween(from, to);
        long errors = requestLogRepository.countByStatusCodeGreaterThanEqualAndTimestampBetween(400, from, to);
        List<RequestLogRepository.ServiceStats> serviceStats = requestLogRepository.getServiceStats(from, to);

        Map<String, Object> result = new HashMap<>();
        result.put("period", "last_24h");
        result.put("totalRequests", totalRequests);
        result.put("rateLimitedRequests", rateLimited);
        result.put("errorRequests", errors);
        result.put("successRate", totalRequests > 0 ? ((totalRequests - errors) * 100.0 / totalRequests) : 100.0);
        result.put("serviceStats", serviceStats);

        return ResponseEntity.ok(result);
    }

    /**
     * GET /admin/logs?page=0&size=50
     * Paginated request logs.
     */
    @GetMapping("/logs")
    public ResponseEntity<Page<RequestLog>> getLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String username) {

        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "timestamp"));

        Page<RequestLog> logs = username != null
                ? requestLogRepository.findByUsername(username, pageRequest)
                : requestLogRepository.findAll(pageRequest);

        return ResponseEntity.ok(logs);
    }

    /**
     * GET /admin/logs/range?from=...&to=...
     * Logs within a time range (ISO-8601).
     */
    @GetMapping("/logs/range")
    public ResponseEntity<List<RequestLog>> getLogsByRange(
            @RequestParam String from,
            @RequestParam String to) {

        List<RequestLog> logs = requestLogRepository.findByTimestampBetween(
                Instant.parse(from), Instant.parse(to)
        );
        return ResponseEntity.ok(logs);
    }

    /**
     * GET /admin/users
     * All users with their rate limit config.
     */
    @GetMapping("/users")
    public ResponseEntity<List<User>> getUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }

    /**
     * PATCH /admin/users/{username}/rate-limit
     * Override rate limit settings per user.
     */
    @PatchMapping("/users/{username}/rate-limit")
    public ResponseEntity<?> updateRateLimit(
            @PathVariable String username,
            @RequestBody RateLimitUpdateRequest request) {

        return userRepository.findByUsername(username)
                .map(user -> {
                    if (request.getCapacity() != null) user.setRateLimitCapacity(request.getCapacity());
                    if (request.getRefillRate() != null) user.setRateLimitRefillRate(request.getRefillRate());
                    if (request.getAlgorithm() != null) user.setRateLimitAlgorithm(request.getAlgorithm());
                    userRepository.save(user);
                    log.info("Rate limit updated for user={}", username);
                    return ResponseEntity.ok(Map.of("message", "Rate limit updated", "user", username));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * GET /admin/rate-limit/status/{userId}
     * Real-time bucket status for a user.
     */
    @GetMapping("/rate-limit/status/{userId}")
    public ResponseEntity<RateLimiterService.RateLimitStatus> getRateLimitStatus(@PathVariable String userId) {
        return ResponseEntity.ok(rateLimiterService.getStatus(userId));
    }

    @lombok.Data
    public static class RateLimitUpdateRequest {
        private Integer capacity;
        private Integer refillRate;
        private User.RateLimitAlgorithm algorithm;
    }
}
