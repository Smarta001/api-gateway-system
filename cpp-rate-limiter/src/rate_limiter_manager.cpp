#include "rate_limiter_manager.hpp"
#include <stdexcept>

using clock_t = std::chrono::steady_clock;

RateLimiterManager::RateLimiterManager(int evict_after_seconds)
    : evict_after_seconds_(evict_after_seconds)
{}

bool RateLimiterManager::is_allowed(const std::string& user_id) {
    std::unique_lock lock(mutex_);
    BucketConfig default_cfg;
    auto& entry = get_or_create(user_id, default_cfg);
    return consume(entry);
}

bool RateLimiterManager::is_allowed(const std::string& user_id, const BucketConfig& config) {
    std::unique_lock lock(mutex_);
    auto& entry = get_or_create(user_id, config);
    return consume(entry);
}

void RateLimiterManager::configure(const std::string& user_id, const BucketConfig& config) {
    std::unique_lock lock(mutex_);
    // Always rebuild bucket on explicit configure call
    AnyBucket bucket;
    if (config.algorithm == Algorithm::TOKEN_BUCKET) {
        bucket = std::make_shared<TokenBucket>(config.capacity, config.rate);
    } else {
        bucket = std::make_shared<LeakyBucket>(config.capacity, config.rate);
    }
    buckets_[user_id] = Entry{ std::move(bucket), config, clock_t::now() };
}

BucketStatus RateLimiterManager::status(const std::string& user_id) {
    std::shared_lock lock(mutex_);
    auto it = buckets_.find(user_id);
    if (it == buckets_.end()) {
        return BucketStatus{ user_id, "none", 0, 0, 0, false };
    }

    const auto& entry = it->second;
    BucketStatus s;
    s.user_id  = user_id;
    s.capacity = entry.config.capacity;
    s.rate     = entry.config.rate;
    s.allowed  = true;

    if (std::holds_alternative<std::shared_ptr<TokenBucket>>(entry.bucket)) {
        auto& tb  = std::get<std::shared_ptr<TokenBucket>>(entry.bucket);
        s.algorithm = "token_bucket";
        s.level     = tb->available_tokens();
    } else {
        auto& lb  = std::get<std::shared_ptr<LeakyBucket>>(entry.bucket);
        s.algorithm = "leaky_bucket";
        s.level     = lb->current_level();
    }
    return s;
}

void RateLimiterManager::evict_stale() {
    std::unique_lock lock(mutex_);
    auto cutoff = clock_t::now() - std::chrono::seconds(evict_after_seconds_);
    for (auto it = buckets_.begin(); it != buckets_.end(); ) {
        if (it->second.last_access < cutoff) {
            it = buckets_.erase(it);
        } else {
            ++it;
        }
    }
}

size_t RateLimiterManager::active_buckets() const {
    std::shared_lock lock(mutex_);
    return buckets_.size();
}

// ── private ────────────────────────────────────────────────────

RateLimiterManager::Entry& RateLimiterManager::get_or_create(
        const std::string& user_id, const BucketConfig& cfg)
{
    auto it = buckets_.find(user_id);
    if (it == buckets_.end()) {
        AnyBucket bucket;
        if (cfg.algorithm == Algorithm::TOKEN_BUCKET) {
            bucket = std::make_shared<TokenBucket>(cfg.capacity, cfg.rate);
        } else {
            bucket = std::make_shared<LeakyBucket>(cfg.capacity, cfg.rate);
        }
        auto [ins, ok] = buckets_.emplace(user_id, Entry{ std::move(bucket), cfg, clock_t::now() });
        return ins->second;
    }
    return it->second;
}

bool RateLimiterManager::consume(Entry& entry) {
    entry.last_access = clock_t::now();
    if (std::holds_alternative<std::shared_ptr<TokenBucket>>(entry.bucket)) {
        return std::get<std::shared_ptr<TokenBucket>>(entry.bucket)->try_consume();
    } else {
        return std::get<std::shared_ptr<LeakyBucket>>(entry.bucket)->try_consume();
    }
}
