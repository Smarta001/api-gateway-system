#pragma once

#include <chrono>
#include <mutex>

/**
 * LeakyBucket — Thread-safe, high-performance Leaky Bucket rate limiter.
 *
 * Incoming requests fill the bucket. The bucket drains at `leak_rate` per second.
 * If the bucket overflows (> capacity) → reject (429).
 *
 * Enforces a smooth, constant output rate — no bursting allowed.
 */
class LeakyBucket {
public:
    LeakyBucket(int capacity, double leak_rate_per_sec);

    /**
     * Try to add a request to the bucket.
     * @return true if accepted, false if bucket full (rate limited).
     */
    bool try_consume();

    double current_level();
    int    capacity()      const { return capacity_; }
    double leak_rate()     const { return leak_rate_; }

private:
    void drain();

    const int    capacity_;
    const double leak_rate_;          // requests drained per second

    double       level_;              // current fill level
    std::chrono::steady_clock::time_point last_drain_;
    std::mutex   mutex_;
};
