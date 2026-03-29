package com.gateway.service;

import com.gateway.model.User;
import com.gateway.ratelimit.LeakyBucket;
import com.gateway.ratelimit.TokenBucket;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class RateLimiterService {

    @Value("${ratelimit.token-bucket.capacity:10}")
    private int defaultTokenCapacity;

    @Value("${ratelimit.token-bucket.refill-rate:5}")
    private int defaultTokenRefillRate;

    @Value("${ratelimit.leaky-bucket.capacity:10}")
    private int defaultLeakyCapacity;

    @Value("${ratelimit.leaky-bucket.leak-rate:2}")
    private int defaultLeakRate;

    // Per-user buckets
    private final Map<String, TokenBucket> tokenBuckets = new ConcurrentHashMap<>();
    private final Map<String, LeakyBucket> leakyBuckets = new ConcurrentHashMap<>();
    private final Map<String, Instant> lastAccessTime = new ConcurrentHashMap<>();

    /**
     * Check rate limit for a user.
     * Uses their configured algorithm (defaults to TOKEN_BUCKET).
     */
    public boolean isAllowed(User user) {
        String userId = user.getId();
        lastAccessTime.put(userId, Instant.now());

        User.RateLimitAlgorithm algo = user.getRateLimitAlgorithm() != null
                ? user.getRateLimitAlgorithm()
                : User.RateLimitAlgorithm.TOKEN_BUCKET;

        return switch (algo) {
            case TOKEN_BUCKET -> checkTokenBucket(user);
            case LEAKY_BUCKET -> checkLeakyBucket(user);
        };
    }

    private boolean checkTokenBucket(User user) {
        TokenBucket bucket = tokenBuckets.computeIfAbsent(user.getId(), id -> {
            int cap = user.getRateLimitCapacity() != null ? user.getRateLimitCapacity() : defaultTokenCapacity;
            int rate = user.getRateLimitRefillRate() != null ? user.getRateLimitRefillRate() : defaultTokenRefillRate;
            log.debug("Creating TokenBucket for user={} cap={} rate={}", user.getUsername(), cap, rate);
            return new TokenBucket(cap, rate);
        });
        return bucket.tryConsume();
    }

    private boolean checkLeakyBucket(User user) {
        LeakyBucket bucket = leakyBuckets.computeIfAbsent(user.getId(), id -> {
            int cap = user.getRateLimitCapacity() != null ? user.getRateLimitCapacity() : defaultLeakyCapacity;
            int rate = user.getRateLimitRefillRate() != null ? user.getRateLimitRefillRate() : defaultLeakRate;
            log.debug("Creating LeakyBucket for user={} cap={} rate={}", user.getUsername(), cap, rate);
            return new LeakyBucket(cap, rate);
        });
        return bucket.tryConsume();
    }

    public RateLimitStatus getStatus(String userId) {
        TokenBucket tb = tokenBuckets.get(userId);
        LeakyBucket lb = leakyBuckets.get(userId);

        return RateLimitStatus.builder()
                .userId(userId)
                .tokenBucketTokens(tb != null ? tb.getAvailableTokens() : -1)
                .tokenBucketCapacity(tb != null ? tb.getCapacity() : -1)
                .leakyBucketLevel(lb != null ? lb.getCurrentLevel() : -1)
                .leakyBucketCapacity(lb != null ? lb.getCapacity() : -1)
                .build();
    }

    // Evict stale buckets every 10 minutes to prevent memory leaks
    @Scheduled(fixedDelay = 600_000)
    public void evictStaleBuckets() {
        Instant cutoff = Instant.now().minusSeconds(600);
        lastAccessTime.entrySet().removeIf(entry -> {
            if (entry.getValue().isBefore(cutoff)) {
                tokenBuckets.remove(entry.getKey());
                leakyBuckets.remove(entry.getKey());
                return true;
            }
            return false;
        });
        log.debug("Eviction complete. Active buckets: token={}, leaky={}", tokenBuckets.size(), leakyBuckets.size());
    }

    @lombok.Builder
    @lombok.Data
    public static class RateLimitStatus {
        private String userId;
        private int tokenBucketTokens;
        private int tokenBucketCapacity;
        private double leakyBucketLevel;
        private int leakyBucketCapacity;
    }
}
