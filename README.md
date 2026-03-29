<<<<<<< HEAD
# API Gateway System

A production-grade, polyglot API Gateway built with Java, C++, Python, and React. Handles JWT authentication, per-user rate limiting, request logging, traffic analytics, and ML-based anomaly detection — all visualised in a real-time admin dashboard.

---

## Live Demo

> Dashboard: [your-vercel-url.vercel.app](https://your-vercel-url.vercel.app)  
> Login: `admin` / `admin123`

---

## Architecture

```
                        ┌─────────────────────────────────┐
                        │       API Gateway  :8080         │
Client ──── JWT ───────▶│                                  │
                        │  ┌─────────────────────────┐    │
                        │  │  JwtAuthenticationFilter │    │
                        │  │  ├── Validate JWT token  │    │
                        │  │  ├── Token Bucket        │    │
                        │  │  ├── Leaky Bucket        │    │
                        │  │  └── Log to MongoDB      │    │
                        │  └─────────────────────────┘    │
                        └──────────┬──────────────────────┘
                                   │ proxy
                     ┌─────────────┼─────────────┐
                     ▼             ▼              ▼
               :8081 Users   :8082 Orders   :8083 Products

                     ┌─────────────────────────────────┐
                     │   C++ Rate Limiter  :9090        │
                     │   High-speed Token/Leaky Bucket  │
                     └─────────────────────────────────┘

                     ┌─────────────────────────────────┐
                     │   Python Analytics  :8000        │
                     │   Pandas + Isolation Forest      │
                     └─────────────────────────────────┘

                     ┌─────────────────────────────────┐
                     │   React Dashboard   :3000        │
                     │   Live metrics + anomaly feed    │
                     └─────────────────────────────────┘
```

---

## Features

- **JWT Authentication** — Stateless login with signed tokens, BCrypt password hashing
- **Dual Rate Limiting** — Token Bucket (allows bursting) and Leaky Bucket (smooth rate) algorithms, configurable per user
- **Request Proxying** — Routes `/api/users`, `/api/orders`, `/api/products` to downstream services
- **MongoDB Logging** — Every request logged with status, latency, user, and rate-limit metadata
- **Admin API** — Paginated logs, per-user rate limit overrides, real-time bucket status
- **Python Analytics** — Traffic summaries, time-series bucketing, per-service and per-user breakdowns
- **ML Anomaly Detection** — Isolation Forest on user behaviour + Z-score spike detection on volume, errors, and latency
- **React Dashboard** — Live traffic chart, anomaly feed, service health bars, rate limit bucket visualiser, logs drawer

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| API Gateway | Java 17, Spring Boot 3.3 | Core routing, JWT auth, rate limiting |
| Rate Limiter | C++20, cpp-httplib | High-speed native rate limiting REST service |
| Analytics | Python 3, FastAPI, Pandas | Traffic analytics and anomaly detection |
| ML | scikit-learn (Isolation Forest) | Unsupervised anomaly detection on user patterns |
| Database | MongoDB 8.x | Request logs and user storage |
| Dashboard | React 18, Vite, Chart.js | Real-time admin UI |

---

## Project Structure

```
api-gateway-system/
├── api-gateway/                  # Java Spring Boot gateway
│   ├── src/main/java/com/gateway/
│   │   ├── controller/           # Auth, Gateway, Admin controllers
│   │   ├── filter/               # JWT authentication filter
│   │   ├── model/                # User, RequestLog models
│   │   ├── ratelimit/            # TokenBucket, LeakyBucket algorithms
│   │   ├── repository/           # MongoDB repositories
│   │   ├── service/              # RateLimiterService, UserDetailsService
│   │   └── config/               # Security, DataSeeder, GlobalExceptionHandler
│   ├── dummy_user_service.py     # Lightweight dummy service :8081
│   ├── dummy_order_service.py    # Lightweight dummy service :8082
│   └── dummy_product_service.py  # Lightweight dummy service :8083
│
├── cpp-rate-limiter/             # Native C++ rate limiter
│   ├── include/                  # TokenBucket, LeakyBucket, Manager headers
│   ├── src/                      # Implementations + REST server
│   └── tests/                    # Thread-safety and correctness tests
│
├── python-analytics/             # FastAPI analytics service
│   ├── src/
│   │   ├── main.py               # FastAPI server + scheduler
│   │   ├── analytics.py          # Pandas aggregations
│   │   ├── anomaly_detector.py   # Isolation Forest + Z-score detection
│   │   └── db.py                 # MongoDB connector
│   └── tests/                    # Unit tests with synthetic data
│
└── admin-dashboard/              # React + Vite admin UI
    └── src/
        ├── components/           # Dashboard, MetricsRow, TrafficChart, etc.
        └── api.js                # Gateway + analytics API client
```

---

## Getting Started

### Prerequisites

- Java 17+
- Maven 3.8+
- Python 3.9+ (Anaconda recommended)
- Node.js 18+ and npm
- MongoDB 8.x
- CMake 3.16+ and GCC/MinGW (for C++ service)

### Run locally

Open 7 terminals and run one command per terminal in this order:

```bash
# Terminal 1 — MongoDB
mongod --dbpath C:\data\db

# Terminal 2 — API Gateway
cd api-gateway
java -jar target/api-gateway-1.0.0.jar --spring.data.mongodb.uri=mongodb://127.0.0.1:27017/api_gateway

# Terminal 3 — User Service
cd api-gateway && python dummy_user_service.py

# Terminal 4 — Order Service
cd api-gateway && python dummy_order_service.py

# Terminal 5 — Product Service
cd api-gateway && python dummy_product_service.py

# Terminal 6 — Python Analytics
cd python-analytics && python src/main.py

# Terminal 7 — Admin Dashboard
cd admin-dashboard && npm run dev
```

Open `http://localhost:3000` and log in with `admin / admin123`.

---

## API Reference

### Authentication

```bash
# Login
POST /auth/login
{ "username": "admin", "password": "admin123" }
→ { "token": "eyJ...", "username": "admin", "roles": [...] }

# Register
POST /auth/register
{ "username": "dave", "password": "pass123", "email": "dave@test.com" }
```

### Gateway Routes (JWT required)

```bash
GET  /api/users             # List all users
GET  /api/users/:id         # Get user by ID
GET  /api/orders            # List all orders
GET  /api/products          # List all products
```

### Admin Endpoints (ADMIN role required)

```bash
GET    /admin/dashboard                        # 24h traffic summary
GET    /admin/logs?page=0&size=50             # Paginated request logs
GET    /admin/users                            # All users
PATCH  /admin/users/:username/rate-limit       # Update rate limit config
GET    /admin/rate-limit/status/:userId        # Live bucket status
```

### Analytics Endpoints

```bash
GET /summary?minutes=60          # Traffic summary
GET /timeseries?minutes=60       # Time-bucketed request counts
GET /services?minutes=60         # Per-service breakdown
GET /users?minutes=60            # Top users by volume
GET /anomalies?minutes=60        # Run anomaly detection
GET /anomalies/latest            # Cached latest report
```

---

## Rate Limiting Algorithms

### Token Bucket
Tokens accumulate up to `capacity` at `refill_rate` per second. Each request consumes one token. Empty bucket → 429. Allows short bursts up to capacity.

### Leaky Bucket
Requests fill a bucket that drains at `leak_rate` per second. Full bucket → 429. Enforces a smooth, constant output rate with no bursting.

Both algorithms are implemented in Java (in-process) and C++ (standalone REST service at `:9090`).

---

## Anomaly Detection

The Python analytics service runs 5 detectors on every `/anomalies` request:

| Detector | Method | Detects |
|---|---|---|
| Volume spikes | Z-score on per-minute counts | Sudden traffic surges |
| Error rate spikes | Z-score on per-minute error rate | Service degradation |
| Latency anomalies | Z-score on avg response time | Slow service periods |
| Suspicious users | Isolation Forest on user features | Unusual behaviour patterns |
| Rate limit abuse | Threshold (>50% requests limited) | Potential DoS attempts |

---

## Seeded Users

| Username | Password | Role | Algorithm | Capacity | Rate |
|---|---|---|---|---|---|
| admin | admin123 | ADMIN | Token Bucket | 1000 | 100/s |
| alice | password123 | USER | Token Bucket | 10 | 5/s |
| bob | password123 | USER | Leaky Bucket | 8 | 2/s |

---

## Screenshots

> Add your dashboard screenshot here

---

## Author

**Smarta** — [github.com/Smarta001](https://github.com/Smarta001)
=======

>>>>>>> 70ced1d167cadd7c0d9494a65f3d16b8329699a0
