"""
anomaly_detector.py — Traffic anomaly detection for the API Gateway.

Detects:
  1. Request volume spikes       (Z-score on per-minute counts)
  2. Error rate spikes           (Z-score on error rate per minute)
  3. Unusual response times      (Z-score on avg response time per minute)
  4. Suspicious user behaviour   (Isolation Forest per-user features)
  5. Rate limit abuse            (users hitting limits repeatedly)
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from db import get_recent_logs


# ── Data models ──────────────────────────────────────────────────

@dataclass
class Anomaly:
    type:        str
    severity:    str          # "low" | "medium" | "high"
    description: str
    value:        float
    threshold:    float
    username:     Optional[str] = None
    service:      Optional[str] = None
    detected_at:  str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


# ── Helpers ──────────────────────────────────────────────────────

def _z_score(series: pd.Series) -> pd.Series:
    mu, sigma = series.mean(), series.std()
    if sigma == 0:
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - mu) / sigma


def _severity(z: float) -> str:
    if abs(z) > 4:  return "high"
    if abs(z) > 3:  return "medium"
    return "low"


# ── Detectors ────────────────────────────────────────────────────

def detect_volume_spikes(df: pd.DataFrame, z_threshold: float = 3.0) -> list[Anomaly]:
    """Flag time buckets where request volume is unusually high."""
    if df.empty:
        return []

    ts = df.set_index("timestamp").resample("1min").agg(count=("statusCode", "count"))
    if len(ts) < 5:
        return []

    ts["z"] = _z_score(ts["count"])
    anomalies = []
    for t, row in ts[ts["z"] > z_threshold].iterrows():
        anomalies.append(Anomaly(
            type        = "volume_spike",
            severity    = _severity(row["z"]),
            description = f"Request volume spike: {int(row['count'])} req/min (z={row['z']:.2f})",
            value       = float(row["count"]),
            threshold   = float(ts["count"].mean() + z_threshold * ts["count"].std()),
        ))
    return anomalies


def detect_error_spikes(df: pd.DataFrame, z_threshold: float = 3.0) -> list[Anomaly]:
    """Flag time buckets with unusually high error rates."""
    if df.empty:
        return []

    ts = df.set_index("timestamp").resample("1min").agg(
        total=("statusCode", "count"),
        errors=("is_error",  "sum"),
    )
    ts["error_rate"] = ts["errors"] / ts["total"].replace(0, np.nan)
    ts = ts.dropna()
    if len(ts) < 5:
        return []

    ts["z"] = _z_score(ts["error_rate"])
    anomalies = []
    for t, row in ts[ts["z"] > z_threshold].iterrows():
        anomalies.append(Anomaly(
            type        = "error_rate_spike",
            severity    = _severity(row["z"]),
            description = f"Error rate spike: {row['error_rate']*100:.1f}% (z={row['z']:.2f})",
            value       = float(row["error_rate"] * 100),
            threshold   = 20.0,
        ))
    return anomalies


def detect_latency_anomalies(df: pd.DataFrame, z_threshold: float = 3.0) -> list[Anomaly]:
    """Flag time buckets with unusually high response times."""
    if df.empty or "responseTimeMs" not in df.columns:
        return []

    ts = df.set_index("timestamp").resample("1min").agg(
        avg_rt=("responseTimeMs", "mean")
    ).dropna()
    if len(ts) < 5:
        return []

    ts["z"] = _z_score(ts["avg_rt"])
    anomalies = []
    for t, row in ts[ts["z"] > z_threshold].iterrows():
        anomalies.append(Anomaly(
            type        = "latency_anomaly",
            severity    = _severity(row["z"]),
            description = f"Latency spike: avg {row['avg_rt']:.0f}ms (z={row['z']:.2f})",
            value       = float(row["avg_rt"]),
            threshold   = float(ts["avg_rt"].mean() + z_threshold * ts["avg_rt"].std()),
        ))
    return anomalies


def detect_suspicious_users(df: pd.DataFrame, contamination: float = 0.05) -> list[Anomaly]:
    """
    Use Isolation Forest on per-user features to flag outliers.
    Features: total_requests, error_rate, rate_limit_rate, avg_response_time.
    """
    if df.empty or "username" not in df.columns:
        return []

    user_df = df.groupby("username").agg(
        total        = ("statusCode",     "count"),
        errors       = ("is_error",       "sum"),
        rate_limited = ("rateLimited",    "sum"),
        avg_rt       = ("responseTimeMs", "mean"),
    ).reset_index()

    if len(user_df) < 5:
        return []

    user_df["error_rate"]  = user_df["errors"]       / user_df["total"]
    user_df["limit_rate"]  = user_df["rate_limited"]  / user_df["total"]

    features = user_df[["total", "error_rate", "limit_rate", "avg_rt"]].fillna(0)
    scaler   = StandardScaler()
    X        = scaler.fit_transform(features)

    clf      = IsolationForest(contamination=contamination, random_state=42)
    preds    = clf.fit_predict(X)
    scores   = clf.decision_function(X)   # more negative = more anomalous

    anomalies = []
    for i, pred in enumerate(preds):
        if pred == -1:
            row = user_df.iloc[i]
            anomalies.append(Anomaly(
                type        = "suspicious_user",
                severity    = "high" if scores[i] < -0.2 else "medium",
                description = (
                    f"Unusual behaviour for '{row['username']}': "
                    f"{int(row['total'])} reqs, {row['error_rate']*100:.1f}% errors, "
                    f"{row['limit_rate']*100:.1f}% rate-limited"
                ),
                value       = float(scores[i]),
                threshold   = 0.0,
                username    = row["username"],
            ))
    return anomalies


def detect_rate_limit_abuse(df: pd.DataFrame, threshold_pct: float = 50.0) -> list[Anomaly]:
    """Flag users where >threshold_pct of requests are rate-limited."""
    if df.empty or "username" not in df.columns:
        return []

    agg = df.groupby("username").agg(
        total        = ("statusCode",  "count"),
        rate_limited = ("rateLimited", "sum"),
    )
    agg["pct"] = agg["rate_limited"] / agg["total"] * 100

    anomalies = []
    for username, row in agg[agg["pct"] > threshold_pct].iterrows():
        anomalies.append(Anomaly(
            type        = "rate_limit_abuse",
            severity    = "high" if row["pct"] > 80 else "medium",
            description = (
                f"User '{username}' hitting rate limits on "
                f"{row['pct']:.0f}% of requests ({int(row['rate_limited'])}/{int(row['total'])})"
            ),
            value       = float(row["pct"]),
            threshold   = threshold_pct,
            username    = str(username),
        ))
    return anomalies


# ── Main entry point ─────────────────────────────────────────────

def run_detection(minutes: int = 60) -> dict:
    """
    Run all anomaly detectors against recent logs.
    Returns a structured report.
    """
    logs = get_recent_logs(minutes=minutes)

    if not logs:
        return {
            "period_minutes": minutes,
            "total_logs":     0,
            "anomalies":      [],
            "summary":        {"high": 0, "medium": 0, "low": 0},
        }

    df = pd.DataFrame(logs)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["is_error"]  = df["statusCode"] >= 400

    # Ensure rateLimited column exists
    if "rateLimited" not in df.columns:
        df["rateLimited"] = False

    all_anomalies: list[Anomaly] = []
    all_anomalies += detect_volume_spikes(df)
    all_anomalies += detect_error_spikes(df)
    all_anomalies += detect_latency_anomalies(df)
    all_anomalies += detect_suspicious_users(df)
    all_anomalies += detect_rate_limit_abuse(df)

    # Sort: high → medium → low
    severity_order = {"high": 0, "medium": 1, "low": 2}
    all_anomalies.sort(key=lambda a: severity_order.get(a.severity, 3))

    counts = {"high": 0, "medium": 0, "low": 0}
    for a in all_anomalies:
        counts[a.severity] = counts.get(a.severity, 0) + 1

    return {
        "period_minutes": minutes,
        "total_logs":     len(logs),
        "anomalies":      [a.to_dict() for a in all_anomalies],
        "summary":        counts,
        "detected_at":    datetime.now(timezone.utc).isoformat(),
    }
