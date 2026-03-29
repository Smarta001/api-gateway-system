# API Gateway — Spring Boot + JWT + Rate Limiting

A production-structured API Gateway with JWT authentication, dual rate limiting algorithms, MongoDB request logging, and an admin dashboard.

---

## Architecture

```
Client
  │
  ▼
┌─────────────────────────────────────────┐
│         API Gateway  :8080              │
│                                         │
│  JwtAuthenticationFilter                │
│    ├── JWT validation                   │
│    ├── Rate limiting (per user)         │
│    │     ├── Token Bucket               │
│    │     └── Leaky Bucket              │
│    └── Request logging → MongoDB        │
│                                         │
│  Controllers                            │
│    ├── /auth/**    → AuthController     │
│    ├── /api/**     → GatewayController  │
│    └── /admin/**   → AdminController    │
└──────────┬──────────────────────────────┘
           │  proxy
    ┌──────┼──────────┐
    ▼      ▼          ▼
 :8081   :8082      :8083
 Users  Orders    Products
```

---

## Prerequisites

- Java 17+
- Maven 3.8+
- MongoDB running on `localhost:27017`

---

## Quick Start

```bash
# 1. Start MongoDB
mongod --dbpath /data/db

# 2. Build
mvn clean package -DskipTests

# 3. Run gateway (port 8080)
java -jar target/api-gateway-1.0.0.jar

# 4. Run dummy services (separate terminals)
java -jar target/api-gateway-1.0.0.jar \
  --spring.main.sources=com.gateway.dummy.DummyUserService \
  --server.port=8081

java -jar target/api-gateway-1.0.0.jar \
  --spring.main.sources=com.gateway.dummy.DummyOrderService \
  --server.port=8082

java -jar target/api-gateway-1.0.0.jar \
  --spring.main.sources=com.gateway.dummy.DummyProductService \
  --server.port=8083
```

---

## Seeded Users

| Username | Password     | Role  | Algorithm    | Capacity | Rate   |
|----------|-------------|-------|--------------|----------|--------|
| admin    | admin123    | ADMIN | Token Bucket | 1000     | 100/s  |
| alice    | password123 | USER  | Token Bucket | 10       | 5/s    |
| bob      | password123 | USER  | Leaky Bucket | 8        | 2/s    |

---

## API Reference

### Authentication

**Login**
```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'
```
Response:
```json
{
  "token": "eyJhbGci...",
  "username": "alice",
  "roles": [{"authority": "ROLE_USER"}]
}
```

**Register**
```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"dave","password":"pass123","email":"dave@test.com"}'
```

---

### Gateway Routes (JWT required)

```bash
TOKEN="eyJhbGci..."

# Users
curl http://localhost:8080/api/users \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:8080/api/users/u1 \
  -H "Authorization: Bearer $TOKEN"

# Orders
curl http://localhost:8080/api/orders \
  -H "Authorization: Bearer $TOKEN"

# Products
curl http://localhost:8080/api/products \
  -H "Authorization: Bearer $TOKEN"
```

Rate limit headers are returned on every response:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
```

When rate limited, you get HTTP `429`:
```json
{"error": "Rate limit exceeded", "status": 429}
```

---

### Admin Endpoints (ADMIN role required)

```bash
ADMIN_TOKEN="eyJhbGci..."   # login as admin

# Dashboard summary (last 24h)
curl http://localhost:8080/admin/dashboard \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Paginated logs
curl "http://localhost:8080/admin/logs?page=0&size=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Logs by user
curl "http://localhost:8080/admin/logs?username=alice" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# All users
curl http://localhost:8080/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Update rate limit for a user
curl -X PATCH http://localhost:8080/admin/users/alice/rate-limit \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"capacity": 20, "refillRate": 10, "algorithm": "LEAKY_BUCKET"}'

# Real-time bucket status
curl http://localhost:8080/admin/rate-limit/status/{userId} \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Rate Limiting Algorithms

### Token Bucket
- Starts full at `capacity` tokens
- Refills at `refillRatePerSecond` tokens/second
- **Allows bursting** up to `capacity` requests
- Each request consumes 1 token; rejected if empty

### Leaky Bucket
- Bucket fills with incoming requests
- Drains at `leakRatePerSecond` per second
- **No bursting** — excess requests dropped immediately
- Smoother, more predictable output rate

---

## Project Structure

```
src/main/java/com/gateway/
├── ApiGatewayApplication.java
├── config/
│   ├── AppConfig.java
│   ├── DataSeeder.java
│   ├── GlobalExceptionHandler.java
│   └── SecurityConfig.java
├── controller/
│   ├── AdminController.java
│   ├── AuthController.java
│   └── GatewayController.java
├── dummy/
│   ├── DummyUserService.java
│   ├── DummyOrderService.java
│   └── DummyProductService.java
├── filter/
│   └── JwtAuthenticationFilter.java
├── model/
│   ├── RequestLog.java
│   └── User.java
├── ratelimit/
│   ├── LeakyBucket.java
│   └── TokenBucket.java
├── repository/
│   ├── RequestLogRepository.java
│   └── UserRepository.java
├── service/
│   ├── RateLimiterService.java
│   └── UserDetailsServiceImpl.java
└── util/
    └── JwtUtil.java
```

---

## What's Next

- **C++ Rate Limiter** — native module for ultra-low-latency limiting, callable via JNI or REST
- **Python Analytics** — traffic anomaly detection service consuming MongoDB logs
- **Admin UI** — React dashboard for real-time traffic visualization
