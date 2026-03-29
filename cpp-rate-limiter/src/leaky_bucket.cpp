#include "leaky_bucket.hpp"
#include <algorithm>

using clock_t = std::chrono::steady_clock;

LeakyBucket::LeakyBucket(int capacity, double leak_rate_per_sec)
    : capacity_(capacity)
    , leak_rate_(leak_rate_per_sec)
    , level_(0.0)                  // start empty
    , last_drain_(clock_t::now())
{}

bool LeakyBucket::try_consume() {
    std::lock_guard<std::mutex> lock(mutex_);
    drain();
    if (level_ < static_cast<double>(capacity_)) {
        level_ += 1.0;
        return true;
    }
    return false;
}

double LeakyBucket::current_level() {
    std::lock_guard<std::mutex> lock(mutex_);
    drain();
    return level_;
}

void LeakyBucket::drain() {
    auto now     = clock_t::now();
    double secs  = std::chrono::duration<double>(now - last_drain_).count();

    if (secs > 0.0) {
        level_      = std::max(0.0, level_ - secs * leak_rate_);
        last_drain_ = now;
    }
}
