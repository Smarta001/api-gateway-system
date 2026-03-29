"""
main.py — FastAPI analytics server for the API Gateway.

Endpoints:
  GET /summary              — traffic summary (last N minutes)
  GET /timeseries           — bucketed time series data
  GET /services             — per-service breakdown
  GET /users                — top users by traffic
  GET /anomalies            — run anomaly detection
  GET /anomalies/latest     — cached latest anomaly report
  GET /health               — health check
"""

from fastapi import FastAPI, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
import uvicorn
import logging
import os

from analytics import (
    compute_summary,
    compute_timeseries,
    compute_service_stats,
    compute_user_stats,
)
from anomaly_detector import run_detection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Cached anomaly report (updated every 5 min by scheduler) ─────
_latest_anomaly_report: dict = {}

def refresh_anomaly_report():
    global _latest_anomaly_report
    logger.info("Refreshing anomaly report...")
    try:
        _latest_anomaly_report = run_detection(minutes=60)
        count = len(_latest_anomaly_report.get("anomalies", []))
        logger.info(f"Anomaly report updated: {count} anomalies found")
    except Exception as e:
        logger.error(f"Anomaly detection failed: {e}")

# ── App lifecycle ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler()
    scheduler.add_job(refresh_anomaly_report, "interval", minutes=5, id="anomaly_refresh")
    scheduler.start()
    refresh_anomaly_report()   # run once at startup
    logger.info("✅ Analytics service started")
    yield
    scheduler.shutdown()

app = FastAPI(
    title="API Gateway Analytics",
    description="Traffic analytics and anomaly detection for the API Gateway",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "analytics"}

@app.get("/summary")
def summary(minutes: int = Query(60, ge=1, le=1440, description="Look-back window in minutes")):
    """Traffic summary: totals, error rate, response times, unique users."""
    return compute_summary(minutes=minutes)

@app.get("/timeseries")
def timeseries(
    minutes:        int = Query(60,  ge=1,  le=1440),
    bucket_seconds: int = Query(60,  ge=10, le=3600, description="Time bucket size in seconds"),
):
    """Time-bucketed request counts, errors, rate limits, avg response time."""
    return compute_timeseries(minutes=minutes, bucket_seconds=bucket_seconds)

@app.get("/services")
def services(minutes: int = Query(60, ge=1, le=1440)):
    """Per-service breakdown: total, errors, error%, avg/p95 response time."""
    return compute_service_stats(minutes=minutes)

@app.get("/users")
def users(
    minutes: int = Query(60, ge=1, le=1440),
    top_n:   int = Query(20, ge=1, le=100, description="Number of top users to return"),
):
    """Top users by request volume with error and rate-limit stats."""
    return compute_user_stats(minutes=minutes, top_n=top_n)

@app.get("/anomalies")
def anomalies(
    minutes:          int   = Query(60,   ge=1,   le=1440),
    z_threshold:      float = Query(3.0,  ge=1.0, le=6.0,  description="Z-score threshold for spike detection"),
    contamination:    float = Query(0.05, ge=0.01, le=0.5, description="Isolation Forest contamination rate"),
    background_tasks: BackgroundTasks = None,
):
    """Run full anomaly detection pipeline and return report."""
    return run_detection(minutes=minutes)

@app.get("/anomalies/latest")
def anomalies_latest():
    """Return the cached anomaly report (refreshed every 5 minutes)."""
    return _latest_anomaly_report or {"message": "No report yet, try /anomalies"}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
