package com.gateway.ratelimit;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Token Bucket Algorithm
 *
 * Tokens accumulate up to a max capacity at a fixed refill rate.
 * Each request consumes one token. If no tokens remain → reject.
 *
 * Allows burst traffic up to `capacity` requests, then enforces
 * a steady rate of `refillRatePerSecond` requests/sec.
 */
public class TokenBucket {

    private final int capacity;
    private final int refillRatePerSecond;
    private int tokens;
    private Instant lastRefillTime;
    private final ReentrantLock lock = new ReentrantLock();

    public TokenBucket(int capacity, int refillRatePerSecond) {
        this.capacity = capacity;
        this.refillRatePerSecond = refillRatePerSecond;
        this.tokens = capacity;  // start full
        this.lastRefillTime = Instant.now();
    }

    /**
     * Attempt to consume one token.
     * @return true if request is allowed, false if rate limited.
     */
    public boolean tryConsume() {
        lock.lock();
        try {
            refill();
            if (tokens > 0) {
                tokens--;
                return true;
            }
            return false;
        } finally {
            lock.unlock();
        }
    }

    private void refill() {
        Instant now = Instant.now();
        long elapsedSeconds = now.getEpochSecond() - lastRefillTime.getEpochSecond();

        if (elapsedSeconds > 0) {
            int newTokens = (int) (elapsedSeconds * refillRatePerSecond);
            tokens = Math.min(capacity, tokens + newTokens);
            lastRefillTime = now;
        }
    }

    public int getAvailableTokens() {
        lock.lock();
        try {
            refill();
            return tokens;
        } finally {
            lock.unlock();
        }
    }

    public int getCapacity() { return capacity; }
    public int getRefillRate() { return refillRatePerSecond; }
}
