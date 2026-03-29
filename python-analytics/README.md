# Python Analytics & Anomaly Detection Service

Reads request logs from MongoDB and provides traffic analytics + ML-powered anomaly detection via a FastAPI REST server.

---

## Setup & Run

```bash
# Install dependencies
pip install -r requirements.txt

# Run (default port 8000)
cd src
python main.py

# Custom port
PORT=8001 python main.py
```

---

## Endpoints

### GET /summary
Traffic summary for the last N minutes.
```bash
curl "http://localhost:8000/summary?minutes=60"
```
```json
{
  "period_minutes": 60,
  "total_requests": 4821,
  "error_requests": 243,
  "rate_limited": 87,
  "error_rate_pct": 5.04,
  "avg_response_time_ms": 142.3,
  "p95_response_time_ms": 489.1,
  "unique_users": 38
}
```

### GET /timeseries
Time-bucketed traffic counts.
```bash
curl "http://localhost:8000/timeseries?minutes=60&bucket_seconds=60"
```

### GET /services
Per-service breakdown.
```bash
curl "http://localhost:8000/services?minutes=60"
```

### GET /users
Top users by traffic volume.
```bash
curl "http://localhost:8000/users?minutes=60&top_n=10"
```

### GET /anomalies
Run the full anomaly detection pipeline on demand.
```bash
curl "http://localhost:8000/anomalies?minutes=60"
```
```json
{
  "period_minutes": 60,
  "total_logs": 4821,
  "detected_at": "2024-03-28T12:00:00Z",
  "summary": { "high": 1, "medium": 2, "low": 0 },
  "anomalies": [
    {
      "type": "rate_limit_abuse",
      "severity": "high",
      "description": "User 'attacker' hitting rate limits on 91% of requests (182/200)",
      "value": 91.0,
      "threshold": 50.0,
      "username": "attacker",
      "detected_at": "..."
    },
    {
      "type": "suspicious_user",
      "severity": "medium",
      "description": "Unusual behaviour for 'bob': 847 reqs, 34.2% errors, 61.0% rate-limited",
      "value": -0.31,
      "threshold": 0.0,
      "username": "bob",
      "detected_at": "..."
    }
  ]
}
```

### GET /anomalies/latest
Returns the cached report (refreshed every 5 minutes automatically).

---

## Anomaly Detectors

| Detector              | Method              | Description                                          |
|-----------------------|---------------------|------------------------------------------------------|
| Volume Spikes         | Z-score             | Flags minute-buckets where req count > μ + 3σ        |
| Error Rate Spikes     | Z-score             | Flags minute-buckets where error rate > μ + 3σ       |
| Latency Anomalies     | Z-score             | Flags minute-buckets where avg response time > μ + 3σ|
| Suspicious Users      | Isolation Forest    | ML outlier detection on per-user feature vectors      |
| Rate Limit Abuse      | Threshold           | Users with >50% of requests rate-limited             |

---

## Run Tests

```bash
pip install pytest
pytest tests/ -v
```

---

## Architecture

```
MongoDB (api_gateway.request_logs)
    │
    ▼
Python Analytics Service (:8000)
    │
    ├── /summary      → Pandas aggregations
    ├── /timeseries   → resample() time buckets
    ├── /services     → groupby(targetService)
    ├── /users        → groupby(username)
    └── /anomalies    → Z-score + Isolation Forest
            │
            └── Background scheduler (5 min) → /anomalies/latest
```
