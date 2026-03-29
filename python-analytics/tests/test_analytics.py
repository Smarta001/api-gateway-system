"""
test_analytics.py — Unit tests for analytics and anomaly detection.
Uses synthetic data — no MongoDB connection required.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

from analytics import (
    compute_summary, compute_timeseries,
    compute_service_stats, compute_user_stats,
)
from anomaly_detector import (
    detect_volume_spikes, detect_error_spikes,
    detect_latency_anomalies, detect_suspicious_users,
    detect_rate_limit_abuse, run_detection,
    Anomaly,
)


# ── Fixtures ──────────────────────────────────────────────────────

def make_logs(n=200, error_rate=0.1, rate_limit_rate=0.05, services=None, users=None):
    """Generate synthetic request log dicts."""
    if services is None: services = ["user-service", "order-service", "product-service"]
    if users    is None: users    = ["alice", "bob", "charlie"]

    rng  = np.random.default_rng(42)
    now  = datetime.now(timezone.utc)
    logs = []

    for i in range(n):
        status       = 500 if rng.random() < error_rate else (429 if rng.random() < 0.05 else 200)
        rate_limited = rng.random() < rate_limit_rate
        logs.append({
            "_id":           f"log_{i}",
            "username":      rng.choice(users),
            "method":        rng.choice(["GET", "POST", "DELETE"]),
            "path":          "/api/test",
            "targetService": rng.choice(services),
            "statusCode":    status,
            "responseTimeMs":float(rng.integers(10, 500)),
            "rateLimited":   bool(rate_limited),
            "authenticated": True,
            "timestamp":     now - timedelta(seconds=int(rng.integers(0, 3600))),
        })
    return logs


def to_df(logs):
    df = pd.DataFrame(logs)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["is_error"]  = df["statusCode"] >= 400
    return df


# ── Analytics tests ───────────────────────────────────────────────

class TestSummary:
    def test_returns_correct_keys(self):
        logs = make_logs(100)
        with patch("analytics.get_recent_logs", return_value=logs):
            result = compute_summary(minutes=60)
        assert "total_requests" in result
        assert "error_rate_pct" in result
        assert "avg_response_time_ms" in result

    def test_total_matches_log_count(self):
        logs = make_logs(150)
        with patch("analytics.get_recent_logs", return_value=logs):
            result = compute_summary(minutes=60)
        assert result["total_requests"] == 150

    def test_empty_logs(self):
        with patch("analytics.get_recent_logs", return_value=[]):
            result = compute_summary(minutes=60)
        assert result["total_requests"] == 0

    def test_error_rate_in_range(self):
        logs = make_logs(200, error_rate=0.2)
        with patch("analytics.get_recent_logs", return_value=logs):
            result = compute_summary(minutes=60)
        assert 0 <= result["error_rate_pct"] <= 100


class TestTimeseries:
    def test_returns_list(self):
        logs = make_logs(200)
        with patch("analytics.get_recent_logs", return_value=logs):
            result = compute_timeseries(minutes=60)
        assert isinstance(result, list)

    def test_bucket_structure(self):
        logs = make_logs(200)
        with patch("analytics.get_recent_logs", return_value=logs):
            result = compute_timeseries(minutes=60)
        if result:
            bucket = result[0]
            assert "timestamp" in bucket
            assert "total" in bucket
            assert "errors" in bucket

    def test_empty_logs(self):
        with patch("analytics.get_recent_logs", return_value=[]):
            result = compute_timeseries(minutes=60)
        assert result == []


class TestServiceStats:
    def test_all_services_present(self):
        services = ["user-service", "order-service", "product-service"]
        logs     = make_logs(300, services=services)
        with patch("analytics.get_recent_logs", return_value=logs):
            result = compute_service_stats(minutes=60)
        found = {r["service"] for r in result}
        assert all(s in found for s in services)

    def test_error_pct_range(self):
        logs = make_logs(200)
        with patch("analytics.get_recent_logs", return_value=logs):
            result = compute_service_stats(minutes=60)
        for r in result:
            assert 0 <= r["error_pct"] <= 100


class TestUserStats:
    def test_top_n_respected(self):
        users = [f"user_{i}" for i in range(30)]
        logs  = make_logs(500, users=users)
        with patch("analytics.get_recent_logs", return_value=logs):
            result = compute_user_stats(minutes=60, top_n=10)
        assert len(result) <= 10


# ── Anomaly detection tests ───────────────────────────────────────

class TestVolumeSpikes:
    def test_detects_spike(self):
        logs = make_logs(200)
        df   = to_df(logs)

        # Inject a spike: add 500 requests in one minute
        now  = datetime.now(timezone.utc)
        spike_logs = make_logs(500)
        for l in spike_logs:
            l["timestamp"] = now - timedelta(seconds=30)
        spike_df = to_df(spike_logs)
        combined = pd.concat([df, spike_df], ignore_index=True)

        anomalies = detect_volume_spikes(combined, z_threshold=2.0)
        assert len(anomalies) > 0
        assert any(a.type == "volume_spike" for a in anomalies)

    def test_no_spike_in_normal_traffic(self):
        logs = make_logs(200)
        df   = to_df(logs)
        anomalies = detect_volume_spikes(df, z_threshold=4.0)
        assert len(anomalies) == 0


class TestErrorSpikes:
    def test_detects_high_error_rate(self):
        logs = make_logs(100, error_rate=0.02)  # mostly OK
        df   = to_df(logs)

        now = datetime.now(timezone.utc)
        bad = make_logs(50, error_rate=0.98)    # almost all errors
        for l in bad:
            l["timestamp"] = now - timedelta(seconds=15)
        bad_df   = to_df(bad)
        combined = pd.concat([df, bad_df], ignore_index=True)

        anomalies = detect_error_spikes(combined, z_threshold=2.0)
        assert len(anomalies) > 0

    def test_no_false_positive_on_stable_errors(self):
        logs = make_logs(200, error_rate=0.1)
        df   = to_df(logs)
        anomalies = detect_error_spikes(df, z_threshold=4.0)
        assert len(anomalies) == 0


class TestRateLimitAbuse:
    def test_flags_abusive_user(self):
        logs = make_logs(100, rate_limit_rate=0.02)   # normal
        # Inject abusive user
        abusive = make_logs(50, users=["attacker"], rate_limit_rate=0.95)
        all_logs = logs + abusive
        df = to_df(all_logs)

        anomalies = detect_rate_limit_abuse(df, threshold_pct=50.0)
        usernames = [a.username for a in anomalies]
        assert "attacker" in usernames

    def test_no_flag_for_normal_user(self):
        logs = make_logs(200, rate_limit_rate=0.05)
        df   = to_df(logs)
        anomalies = detect_rate_limit_abuse(df, threshold_pct=50.0)
        assert len(anomalies) == 0


class TestSuspiciousUsers:
    def test_returns_list_of_anomalies(self):
        users = [f"user_{i}" for i in range(20)]
        logs  = make_logs(400, users=users)
        df    = to_df(logs)
        result = detect_suspicious_users(df, contamination=0.1)
        assert isinstance(result, list)
        for a in result:
            assert isinstance(a, Anomaly)
            assert a.type == "suspicious_user"


class TestRunDetection:
    def test_full_pipeline(self):
        logs = make_logs(300)
        with patch("anomaly_detector.get_recent_logs", return_value=logs):
            result = run_detection(minutes=60)
        assert "anomalies"      in result
        assert "summary"        in result
        assert "total_logs"     in result
        assert "period_minutes" in result

    def test_empty_logs(self):
        with patch("anomaly_detector.get_recent_logs", return_value=[]):
            result = run_detection(minutes=60)
        assert result["total_logs"] == 0
        assert result["anomalies"]  == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
