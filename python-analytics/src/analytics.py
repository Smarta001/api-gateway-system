"""
analytics.py — Core traffic analytics computed from request logs.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import Optional
from db import get_recent_logs, get_logs


def _to_df(logs: list[dict]) -> pd.DataFrame:
    if not logs:
        return pd.DataFrame()
    df = pd.DataFrame(logs)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["is_error"]  = df["statusCode"] >= 400
    df["is_5xx"]    = df["statusCode"] >= 500
    return df


# ── Summary ──────────────────────────────────────────────────────

def compute_summary(minutes: int = 60) -> dict:
    """High-level traffic summary for the last N minutes."""
    logs = get_recent_logs(minutes=minutes)
    df   = _to_df(logs)

    if df.empty:
        return {"period_minutes": minutes, "total_requests": 0}

    total     = len(df)
    errors    = df["is_error"].sum()
    limited   = df["rateLimited"].sum() if "rateLimited" in df.columns else 0
    avg_rt    = df["responseTimeMs"].mean() if "responseTimeMs" in df.columns else 0
    p95_rt    = df["responseTimeMs"].quantile(0.95) if "responseTimeMs" in df.columns else 0

    return {
        "period_minutes":       minutes,
        "total_requests":       int(total),
        "error_requests":       int(errors),
        "rate_limited":         int(limited),
        "error_rate_pct":       round(errors / total * 100, 2) if total else 0,
        "rate_limited_pct":     round(limited / total * 100, 2) if total else 0,
        "avg_response_time_ms": round(float(avg_rt), 2),
        "p95_response_time_ms": round(float(p95_rt), 2),
        "unique_users":         int(df["username"].nunique()) if "username" in df.columns else 0,
    }


# ── Time Series ──────────────────────────────────────────────────

def compute_timeseries(minutes: int = 60, bucket_seconds: int = 60) -> list[dict]:
    """
    Bucket requests into time windows.
    Returns a list of { timestamp, total, errors, rate_limited, avg_response_ms }.
    """
    logs = get_recent_logs(minutes=minutes)
    df   = _to_df(logs)

    if df.empty:
        return []

    rule = f"{bucket_seconds}s"
    df   = df.set_index("timestamp")

    agg = df.resample(rule).agg(
        total          = ("statusCode",      "count"),
        errors         = ("is_error",        "sum"),
        rate_limited   = ("rateLimited",     "sum"),
        avg_resp_ms    = ("responseTimeMs",  "mean"),
    ).reset_index()

    return [
        {
            "timestamp":      row["timestamp"].isoformat(),
            "total":          int(row["total"]),
            "errors":         int(row["errors"]),
            "rate_limited":   int(row["rate_limited"]),
            "avg_resp_ms":    round(float(row["avg_resp_ms"]), 2),
        }
        for _, row in agg.iterrows()
    ]


# ── Per-service breakdown ────────────────────────────────────────

def compute_service_stats(minutes: int = 60) -> list[dict]:
    logs = get_recent_logs(minutes=minutes)
    df   = _to_df(logs)

    if df.empty or "targetService" not in df.columns:
        return []

    agg = df.groupby("targetService").agg(
        total        = ("statusCode",     "count"),
        errors       = ("is_error",       "sum"),
        avg_resp_ms  = ("responseTimeMs", "mean"),
        p95_resp_ms  = ("responseTimeMs", lambda x: x.quantile(0.95)),
    ).reset_index()

    return [
        {
            "service":      row["targetService"],
            "total":        int(row["total"]),
            "errors":       int(row["errors"]),
            "error_pct":    round(row["errors"] / row["total"] * 100, 2),
            "avg_resp_ms":  round(float(row["avg_resp_ms"]), 2),
            "p95_resp_ms":  round(float(row["p95_resp_ms"]), 2),
        }
        for _, row in agg.iterrows()
    ]


# ── Per-user breakdown ───────────────────────────────────────────

def compute_user_stats(minutes: int = 60, top_n: int = 20) -> list[dict]:
    logs = get_recent_logs(minutes=minutes)
    df   = _to_df(logs)

    if df.empty or "username" not in df.columns:
        return []

    agg = df.groupby("username").agg(
        total        = ("statusCode",     "count"),
        errors       = ("is_error",       "sum"),
        rate_limited = ("rateLimited",    "sum"),
        avg_resp_ms  = ("responseTimeMs", "mean"),
    ).reset_index().sort_values("total", ascending=False).head(top_n)

    return [
        {
            "username":     row["username"],
            "total":        int(row["total"]),
            "errors":       int(row["errors"]),
            "rate_limited": int(row["rate_limited"]),
            "avg_resp_ms":  round(float(row["avg_resp_ms"]), 2),
        }
        for _, row in agg.iterrows()
    ]
