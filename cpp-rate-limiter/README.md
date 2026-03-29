# C++ Rate Limiter Service

High-performance rate limiter exposing Token Bucket and Leaky Bucket algorithms via a REST API. Designed to be called by the Java Spring Boot gateway for nanosecond-precision, lock-minimized rate decisions.

---

## Build & Run

```bash
# Prerequisites: cmake, g++ (C++20), git

mkdir build && cd build
cmake ..
make -j$(nproc)

# Run on port 9090 (default)
./rate_limiter_server

# Custom port
./rate_limiter_server 7777
```

---

## API

### POST /check
Check and consume one request for a user.

```bash
curl -X POST http://localhost:9090/check \
  -H "Content-Type: application/json" \
  -d '{
    "user_id":   "alice",
    "algorithm": "token_bucket",
    "capacity":  10,
    "rate":      5.0
  }'
```

Response `200 OK` (allowed):
```json
{ "user_id": "alice", "algorithm": "token_bucket", "level": 9, "capacity": 10, "rate": 5.0, "allowed": true }
```

Response `429 Too Many Requests` (rate limited):
```json
{ "user_id": "alice", "algorithm": "token_bucket", "level": 0, "capacity": 10, "rate": 5.0, "allowed": false }
```

### POST /configure
Explicitly set config for a user (resets their bucket).

```bash
curl -X POST http://localhost:9090/configure \
  -H "Content-Type: application/json" \
  -d '{"user_id":"alice","algorithm":"leaky_bucket","capacity":20,"rate":3.0}'
```

### GET /status/:user_id
```bash
curl http://localhost:9090/status/alice
```

### GET /health
```bash
curl http://localhost:9090/health
# {"status":"ok","buckets":3}
```

### DELETE /evict
Manually trigger eviction of stale buckets.

---

## Run Tests

```bash
cd build
ctest -V
# or directly:
./run_tests
```

---

## Java Integration

Enable in `application.properties`:
```properties
cpp.ratelimiter.enabled=true
cpp.ratelimiter.url=http://localhost:9090
```

The `CppRateLimiterClient` bean activates and routes rate limit checks to this service. It **fails open** (allows traffic) if the C++ service is unreachable.

---

## Algorithms

| Algorithm    | Burst | Smoothing | Use case                        |
|--------------|-------|-----------|----------------------------------|
| Token Bucket | ✅    | ❌        | APIs that allow short bursts     |
| Leaky Bucket | ❌    | ✅        | Strict throughput enforcement    |

---

## Architecture

```
Java Gateway
    │
    │  POST /check {"user_id":"alice","algorithm":"token_bucket",...}
    ▼
C++ Rate Limiter Service (:9090)
    │
    ├── RateLimiterManager  (ConcurrentHashMap, shared_mutex)
    │     ├── alice → TokenBucket  (cap=10, refill=5/s)
    │     ├── bob   → LeakyBucket  (cap=8,  leak=2/s)
    │     └── ...
    │
    └── Background eviction thread (every 5 min)
```
