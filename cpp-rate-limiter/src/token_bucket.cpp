#include "token_bucket.hpp"
#include <algorithm>

using clock_t = std::chrono::steady_clock;

TokenBucket::TokenBucket(int capacity, double refill_rate_per_sec)
    : capacity_(capacity)
    , refill_rate_(refill_rate_per_sec)
    , tokens_(static_cast<double>(capacity))   // start full
    , last_refill_(clock_t::now())
{}

bool TokenBucket::try_consume() {
    std::lock_guard<std::mutex> lock(mutex_);
    refill();
    if (tokens_ >= 1.0) {
        tokens_ -= 1.0;
        return true;
    }
    return false;
}

int TokenBucket::available_tokens() {
    std::lock_guard<std::mutex> lock(mutex_);
    refill();
    return static_cast<int>(tokens_);
}

void TokenBucket::refill() {
    auto now     = clock_t::now();
    double secs  = std::chrono::duration<double>(now - last_refill_).count();

    if (secs > 0.0) {
        tokens_      = std::min(static_cast<double>(capacity_),
                                tokens_ + secs * refill_rate_);
        last_refill_ = now;
    }
}
