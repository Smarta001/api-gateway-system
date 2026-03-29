import { useState, useEffect, useCallback } from "react";
import { MetricsRow, TrafficChart, ServicePanel, AnomalyFeed, UsersTable, BucketPanel, LogsDrawer } from "./index";







import {
  fetchSummary, fetchTimeseries, fetchServiceStats,
  fetchUserStats, fetchLatestAnomalies, fetchUsers,
} from "../api";

const WINDOWS = [
  { label: "1h",  minutes: 60  },
  { label: "6h",  minutes: 360 },
  { label: "24h", minutes: 1440 },
];

export function Dashboard({ token, username, onLogout }) {
  const [window, setWindow]       = useState(WINDOWS[0]);
  const [summary, setSummary]     = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [services, setServices]   = useState([]);
  const [users, setUsers]         = useState([]);
  const [gwUsers, setGwUsers]     = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [logsOpen, setLogsOpen]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, ts, svc, usr, anom, gwUsr] = await Promise.allSettled([
        fetchSummary(window.minutes),
        fetchTimeseries(window.minutes, window.minutes <= 60 ? 60 : 300),
        fetchServiceStats(window.minutes),
        fetchUserStats(window.minutes),
        fetchLatestAnomalies(),
        fetchUsers(token),
      ]);

      if (s.status === "fulfilled")    setSummary(s.value);
      if (ts.status === "fulfilled")   setTimeseries(ts.value);
      if (svc.status === "fulfilled")  setServices(svc.value);
      if (usr.status === "fulfilled")  setUsers(usr.value);
      if (anom.status === "fulfilled") setAnomalies(anom.value?.anomalies || []);
      if (gwUsr.status === "fulfilled") setGwUsers(gwUsr.value);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [window, token]);

  // Auto-refresh every 30s
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", fontFamily: "'Syne', sans-serif" }}>
      {/* Topbar */}
      <div style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "0 1.5rem", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "#1D9E75", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="6" width="12" height="8" rx="2" fill="white" opacity="0.9"/>
              <path d="M5 6V4a3 3 0 016 0v2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>API Gateway Admin</span>
          <span style={{ fontSize: 11, background: "#E1F5EE", color: "#0F6E56", padding: "2px 8px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#1D9E75", animation: "pulse 2s infinite", display: "inline-block" }} />
            Live
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Time window */}
          <div style={{ display: "flex", background: "var(--color-background-secondary)", padding: 3, borderRadius: 8, gap: 3 }}>
            {WINDOWS.map(w => (
              <button key={w.label} onClick={() => setWindow(w)}
                style={{ padding: "3px 10px", fontSize: 12, fontWeight: 500, border: window.label === w.label ? "0.5px solid var(--color-border-tertiary)" : "none", background: window.label === w.label ? "var(--color-background-primary)" : "transparent", borderRadius: 5, cursor: "pointer", color: "var(--color-text-primary)" }}>
                {w.label}
              </button>
            ))}
          </div>

          <button onClick={() => setLogsOpen(true)}
            style={{ fontSize: 12, padding: "5px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
            Logs
          </button>

          <button onClick={load}
            style={{ fontSize: 12, padding: "5px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
            ↻ Refresh
          </button>

          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            {username}
          </span>
          <button onClick={onLogout}
            style={{ fontSize: 12, padding: "5px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "1.25rem 1.5rem", maxWidth: 1400, margin: "0 auto" }}>
        <MetricsRow summary={summary} loading={loading} />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
          <TrafficChart data={timeseries} />
          <ServicePanel services={services} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <AnomalyFeed anomalies={anomalies} onRefresh={load} />
          <UsersTable users={users} />
        </div>

        <BucketPanel gwUsers={gwUsers} token={token} onUpdated={load} />

        <div style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)", marginTop: 16 }}>
          Last refreshed: {lastRefresh.toLocaleTimeString()} · Auto-refresh every 30s
        </div>
      </div>

      {logsOpen && <LogsDrawer token={token} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
