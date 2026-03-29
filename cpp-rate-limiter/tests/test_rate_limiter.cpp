#include "token_bucket.hpp"
#include "leaky_bucket.hpp"
#include "rate_limiter_manager.hpp"

#include <iostream>
#include <thread>
#include <vector>
#include <atomic>
#include <cassert>
#include <chrono>

// ── Minimal test harness ─────────────────────────────────────────
int tests_run = 0, tests_passed = 0;

#define TEST(name) \
    std::cout << "[TEST] " #name " ... "; \
    ++tests_run; \
    [&]()

#define ASSERT(expr) \
    if (!(expr)) { \
        std::cout << "FAIL\n  Assertion failed: " #expr "\n"; \
        return; \
    }

#define PASS() \
    ++tests_passed; \
    std::cout << "PASS\n"

using namespace std::chrono_literals;

// ── Token Bucket Tests ───────────────────────────────────────────

void test_token_bucket_basic() {
    TEST(TokenBucket_InitiallyFull) {
        TokenBucket tb(5, 1.0);
        ASSERT(tb.available_tokens() == 5);
        PASS();
    }();

    TEST(TokenBucket_ConsumesTokens) {
        TokenBucket tb(5, 1.0);
        ASSERT(tb.try_consume() == true);
        ASSERT(tb.try_consume() == true);
        ASSERT(tb.available_tokens() == 3);
        PASS();
    }();

    TEST(TokenBucket_RejectsWhenEmpty) {
        TokenBucket tb(3, 0.1);  // very slow refill
        tb.try_consume();
        tb.try_consume();
        tb.try_consume();
        ASSERT(tb.try_consume() == false);
        PASS();
    }();

    TEST(TokenBucket_Refills_AfterDelay) {
        TokenBucket tb(3, 10.0);  // 10 tokens/sec
        tb.try_consume(); tb.try_consume(); tb.try_consume();
        ASSERT(tb.try_consume() == false);
        std::this_thread::sleep_for(200ms);
        // After 0.2s at 10/s → ~2 new tokens
        ASSERT(tb.try_consume() == true);
        PASS();
    }();

    TEST(TokenBucket_CapNotExceeded) {
        TokenBucket tb(3, 100.0);  // fast refill
        std::this_thread::sleep_for(200ms);
        ASSERT(tb.available_tokens() == 3);   // capped at 3
        PASS();
    }();
}

// ── Leaky Bucket Tests ───────────────────────────────────────────

void test_leaky_bucket_basic() {
    TEST(LeakyBucket_StartsEmpty) {
        LeakyBucket lb(5, 1.0);
        ASSERT(lb.current_level() < 0.001);
        PASS();
    }();

    TEST(LeakyBucket_AcceptsRequests) {
        LeakyBucket lb(5, 0.1);  // very slow drain
        ASSERT(lb.try_consume() == true);
        ASSERT(lb.try_consume() == true);
        ASSERT(lb.current_level() > 1.5);
        PASS();
    }();

    TEST(LeakyBucket_RejectsWhenFull) {
        LeakyBucket lb(3, 0.01);   // almost no drain
        lb.try_consume(); lb.try_consume(); lb.try_consume();
        ASSERT(lb.try_consume() == false);
        PASS();
    }();

    TEST(LeakyBucket_DrainsOverTime) {
        LeakyBucket lb(5, 10.0);   // drains 10/sec
        lb.try_consume(); lb.try_consume(); lb.try_consume();
        std::this_thread::sleep_for(300ms);
        // After 0.3s at 10/s → ~3 drained → level ~0
        ASSERT(lb.current_level() < 1.0);
        PASS();
    }();
}

// ── Thread-safety Tests ──────────────────────────────────────────

void test_thread_safety() {
    TEST(TokenBucket_ThreadSafe) {
        TokenBucket tb(100, 0.0);  // 100 tokens, no refill
        std::atomic<int> allowed{0};
        std::vector<std::thread> threads;

        for (int i = 0; i < 20; ++i) {
            threads.emplace_back([&] {
                for (int j = 0; j < 10; ++j) {
                    if (tb.try_consume()) ++allowed;
                }
            });
        }
        for (auto& t : threads) t.join();

        // 20 threads × 10 requests = 200 attempts, only 100 should succeed
        ASSERT(allowed.load() == 100);
        PASS();
    }();

    TEST(LeakyBucket_ThreadSafe) {
        LeakyBucket lb(50, 0.0);   // 50 capacity, no drain
        std::atomic<int> allowed{0};
        std::vector<std::thread> threads;

        for (int i = 0; i < 10; ++i) {
            threads.emplace_back([&] {
                for (int j = 0; j < 10; ++j) {
                    if (lb.try_consume()) ++allowed;
                }
            });
        }
        for (auto& t : threads) t.join();

        ASSERT(allowed.load() == 50);
        PASS();
    }();
}

// ── Manager Tests ────────────────────────────────────────────────

void test_manager() {
    TEST(Manager_DefaultBucket) {
        RateLimiterManager mgr;
        ASSERT(mgr.is_allowed("user1") == true);
        PASS();
    }();

    TEST(Manager_PerUserIsolation) {
        RateLimiterManager mgr;
        BucketConfig cfg;
        cfg.capacity = 2; cfg.rate = 0.0;

        mgr.is_allowed("a", cfg);
        mgr.is_allowed("a", cfg);
        bool a_blocked = !mgr.is_allowed("a", cfg);
        bool b_allowed = mgr.is_allowed("b", cfg);

        ASSERT(a_blocked);
        ASSERT(b_allowed);
        PASS();
    }();

    TEST(Manager_Configure_ResetsState) {
        RateLimiterManager mgr;
        BucketConfig small; small.capacity = 1; small.rate = 0.0;
        mgr.is_allowed("u", small);
        ASSERT(mgr.is_allowed("u", small) == false);

        BucketConfig big; big.capacity = 100; big.rate = 0.0;
        mgr.configure("u", big);
        ASSERT(mgr.is_allowed("u", big) == true);
        PASS();
    }();

    TEST(Manager_Status) {
        RateLimiterManager mgr;
        BucketConfig cfg; cfg.algorithm = Algorithm::TOKEN_BUCKET;
        cfg.capacity = 5; cfg.rate = 1.0;
        mgr.is_allowed("u2", cfg);
        BucketStatus st = mgr.status("u2");
        ASSERT(st.capacity == 5);
        ASSERT(st.algorithm == "token_bucket");
        PASS();
    }();

    TEST(Manager_ActiveBuckets) {
        RateLimiterManager mgr;
        mgr.is_allowed("x"); mgr.is_allowed("y"); mgr.is_allowed("z");
        ASSERT(mgr.active_buckets() == 3);
        PASS();
    }();
}

// ── Entry point ──────────────────────────────────────────────────

int main() {
    std::cout << "=== Rate Limiter Unit Tests ===\n\n";

    test_token_bucket_basic();
    test_leaky_bucket_basic();
    test_thread_safety();
    test_manager();

    std::cout << "\n==============================\n";
    std::cout << "Results: " << tests_passed << "/" << tests_run << " passed\n";

    return (tests_passed == tests_run) ? 0 : 1;
}
