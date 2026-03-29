#pragma once

#include "token_bucket.hpp"
#include "leaky_bucket.hpp"

#include <string>
#include <unordered_map>
#include <memory>
#include <shared_mutex>
#include <chrono>
#include <variant>

enum class Algorithm { TOKEN_BUCKET, LEAKY_BUCKET };

struct BucketConfig {
    Algorithm algorithm  = Algorithm::TOKEN_BUCKET;
    int       capacity   = 10;
    double    rate       = 5.0;   // refill/leak rate per second
};

struct BucketStatus {
    std::string user_id;
    std::string algorithm;
    double      level;            // tokens remaining or fill level
    int         capacity;
    double      rate;
    bool        allowed;
};

/**
 * RateLimiterManager
 *
 * Central registry mapping user_id → bucket.
 * Thread-safe with shared_mutex (concurrent reads, exclusive writes).
 * Inactive buckets are evicted after `evict_after_seconds`.
 */
class RateLimiterManager {
public:
    explicit RateLimiterManager(int evict_after_seconds = 600);

    /**
     * Check and consume one request for a user.
     * Creates a bucket with default config on first call.
     */
    bool is_allowed(const std::string& user_id);

    /**
     * Check with explicit config (creates/replaces bucket).
     */
    bool is_allowed(const std::string& user_id, const BucketConfig& config);

    /**
     * Update a user's rate limit config (resets their bucket).
     */
    void configure(const std::string& user_id, const BucketConfig& config);

    /**
     * Get current bucket status for a user.
     */
    BucketStatus status(const std::string& user_id);

    /**
     * Evict buckets that haven't been accessed recently.
     * Call periodically (e.g. from a background thread).
     */
    void evict_stale();

    size_t active_buckets() const;

private:
    using TokenPtr  = std::shared_ptr<TokenBucket>;
    using LeakyPtr  = std::shared_ptr<LeakyBucket>;
    using AnyBucket = std::variant<TokenPtr, LeakyPtr>;

    struct Entry {
        AnyBucket   bucket;
        BucketConfig config;
        std::chrono::steady_clock::time_point last_access;
    };

    std::unordered_map<std::string, Entry> buckets_;
    mutable std::shared_mutex              mutex_;
    int                                    evict_after_seconds_;

    Entry& get_or_create(const std::string& user_id, const BucketConfig& cfg);
    bool   consume(Entry& entry);
};
