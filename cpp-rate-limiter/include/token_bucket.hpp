#pragma once

#include <chrono>
#include <mutex>
#include <atomic>

/**
 * TokenBucket — Thread-safe, high-performance Token Bucket rate limiter.
 *
 * Tokens accumulate at `refill_rate` per second up to `capacity`.
 * Each request consumes one token. If empty → reject (429).
 *
 * Designed for nanosecond-precision refill using steady_clock.
 */
class TokenBucket {
public:
    TokenBucket(int capacity, double refill_rate_per_sec);

    /**
     * Try to consume one token.
     * @return true if allowed, false if rate limited.
     */
    bool try_consume();

    int  available_tokens();
    int  capacity()         const { return capacity_; }
    double refill_rate()    const { return refill_rate_; }

private:
    void refill();

    const int    capacity_;
    const double refill_rate_;        // tokens per second

    double       tokens_;
    std::chrono::steady_clock::time_point last_refill_;
    std::mutex   mutex_;
};
