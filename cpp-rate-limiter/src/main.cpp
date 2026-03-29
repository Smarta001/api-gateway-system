#include "rate_limiter_manager.hpp"

#include <httplib.h>
#include <nlohmann/json.hpp>

#include <iostream>
#include <thread>
#include <chrono>
#include <csignal>
#include <atomic>

using json = nlohmann::json;

// ── Globals ──────────────────────────────────────────────────────
static RateLimiterManager g_manager(600);   // evict after 10 min
static std::atomic<bool>  g_running{true};

// ── Helpers ──────────────────────────────────────────────────────

static BucketConfig parse_config(const json& body) {
    BucketConfig cfg;
    if (body.contains("algorithm")) {
        cfg.algorithm = (body["algorithm"] == "leaky_bucket")
                        ? Algorithm::LEAKY_BUCKET
                        : Algorithm::TOKEN_BUCKET;
    }
    if (body.contains("capacity"))  cfg.capacity = body["capacity"].get<int>();
    if (body.contains("rate"))      cfg.rate     = body["rate"].get<double>();
    return cfg;
}

static json status_to_json(const BucketStatus& s) {
    return json{
        {"user_id",   s.user_id},
        {"algorithm", s.algorithm},
        {"level",     s.level},
        {"capacity",  s.capacity},
        {"rate",      s.rate}
    };
}

// ── Background eviction thread ───────────────────────────────────
static void eviction_loop() {
    while (g_running) {
        std::this_thread::sleep_for(std::chrono::minutes(5));
        g_manager.evict_stale();
        std::cout << "[evict] active buckets: " << g_manager.active_buckets() << "\n";
    }
}

// ── main ─────────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    int port = 9090;
    if (argc > 1) port = std::stoi(argv[1]);

    httplib::Server svr;

    // ── POST /check  ───────────────────────────────────────────────
    // Body: { "user_id": "alice", "algorithm": "token_bucket", "capacity": 10, "rate": 5 }
    // Response 200: allowed=true  |  Response 429: allowed=false
    svr.Post("/check", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            if (!body.contains("user_id")) {
                res.status = 400;
                res.set_content(R"({"error":"user_id required"})", "application/json");
                return;
            }

            std::string user_id = body["user_id"];
            BucketConfig cfg    = parse_config(body);
            bool allowed        = g_manager.is_allowed(user_id, cfg);
            BucketStatus st     = g_manager.status(user_id);

            json resp = status_to_json(st);
            resp["allowed"] = allowed;

            res.status = allowed ? 200 : 429;
            res.set_content(resp.dump(), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"error", e.what()}}.dump(), "application/json");
        }
    });

    // ── POST /configure  ───────────────────────────────────────────
    // Explicitly set config for a user (resets their bucket).
    svr.Post("/configure", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            if (!body.contains("user_id")) {
                res.status = 400;
                res.set_content(R"({"error":"user_id required"})", "application/json");
                return;
            }
            std::string user_id = body["user_id"];
            BucketConfig cfg    = parse_config(body);
            g_manager.configure(user_id, cfg);

            res.set_content(json{{"status","configured"},{"user_id",user_id}}.dump(), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(json{{"error", e.what()}}.dump(), "application/json");
        }
    });

    // ── GET /status/:user_id  ──────────────────────────────────────
    svr.Get(R"(/status/([^/]+))", [](const httplib::Request& req, httplib::Response& res) {
        std::string user_id = req.matches[1];
        BucketStatus st     = g_manager.status(user_id);
        res.set_content(status_to_json(st).dump(), "application/json");
    });

    // ── GET /health  ───────────────────────────────────────────────
    svr.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(json{
            {"status",  "ok"},
            {"buckets", g_manager.active_buckets()}
        }.dump(), "application/json");
    });

    // ── DELETE /evict  ─────────────────────────────────────────────
    svr.Delete("/evict", [](const httplib::Request&, httplib::Response& res) {
        size_t before = g_manager.active_buckets();
        g_manager.evict_stale();
        size_t after  = g_manager.active_buckets();
        res.set_content(json{{"evicted", before - after},{"remaining", after}}.dump(), "application/json");
    });

    // Start eviction thread
    std::thread evict_thread(eviction_loop);
    evict_thread.detach();

    std::cout << "╔══════════════════════════════════════╗\n";
    std::cout << "║   C++ Rate Limiter Service           ║\n";
    std::cout << "║   http://localhost:" << port << "              ║\n";
    std::cout << "╚══════════════════════════════════════╝\n";
    std::cout << "Endpoints:\n";
    std::cout << "  POST   /check          — check & consume\n";
    std::cout << "  POST   /configure      — set user config\n";
    std::cout << "  GET    /status/:uid    — bucket status\n";
    std::cout << "  GET    /health         — health check\n";
    std::cout << "  DELETE /evict          — manual eviction\n\n";

    svr.listen("0.0.0.0", port);
    g_running = false;
    return 0;
}
