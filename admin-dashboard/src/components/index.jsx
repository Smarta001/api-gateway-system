import { useRef, useEffect, useState } from "react";
import { fetchRateLimitStatus, updateRateLimit, fetchLogs } from "../api";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

// ── Shared styles ─────────────────────────────────────────────────
const panel = {
  background: "var(--color-background-primary)",
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: 12,
  padding: 16,
};

const metricCard = {
  background: "var(--color-background-secondary)",
  borderRadius: 8,
  padding: "14px 16px",
  position: "relative",
  overflow: "hidden",
};

function Skeleton({ w = "60%", h = 20 }) {
  return (
    <div style={{ width: w, height: h, background: "var(--color-background-secondary)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
  );
}

// ── MetricsRow ────────────────────────────────────────────────────
export function MetricsRow({ summary, loading }) {
  const cards = [
    { label: "Total Requests", key: "total_requests",       fmt: v => v?.toLocaleString(), accent: "#1D9E75", sub: s => `${s?.unique_users ?? 0} unique users` },
    { label: "Error Rate",     key: "error_rate_pct",        fmt: v => v?.toFixed(1)+"%",   accent: "#E24B4A", sub: s => `${s?.error_requests ?? 0} errors` },
    { label: "Rate Limited",   key: "rate_limited",          fmt: v => v?.toLocaleString(), accent: "#BA7517", sub: s => `${s?.rate_limited_pct?.toFixed(1) ?? 0}% of traffic` },
    { label: "Avg Response",   key: "avg_response_time_ms",  fmt: v => Math.round(v)+"ms",  accent: "#378ADD", sub: s => `p95: ${Math.round(s?.p95_response_time_ms ?? 0)}ms` },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
      {cards.map(c => (
        <div key={c.key} style={metricCard}>
          <div style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>{c.label}</div>
          {loading ? <Skeleton h={28} /> : (
            <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, marginBottom: 4 }}>{c.fmt(summary?.[c.key])}</div>
          )}
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{loading ? "" : c.sub(summary)}</div>
          <div style={{ position: "absolute", top: 0, right: 0, width: 3, height: "100%", background: c.accent }} />
        </div>
      ))}
    </div>
  );
}

// ── TrafficChart ──────────────────────────────────────────────────
export function TrafficChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!data?.length || !canvasRef.current) return;
    

    if (chartRef.current) chartRef.current.destroy();

    const labels  = data.map(d => new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    const success = data.map(d => d.total - d.errors - d.rate_limited);
    const errors  = data.map(d => d.errors);
    const limited = data.map(d => d.rate_limited);

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Success", data: success, backgroundColor: "rgba(29,158,117,0.75)", stack: "s", borderRadius: 2 },
          { label: "Errors",  data: errors,  backgroundColor: "rgba(226,75,74,0.75)",  stack: "s", borderRadius: 2 },
          { label: "Limited", data: limited, backgroundColor: "rgba(186,117,23,0.65)", stack: "s", borderRadius: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
        scales: {
          x: { stacked: true, ticks: { maxTicksLimit: 8, color: "#888", font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: "#888", font: { size: 10 } }, grid: { color: "rgba(128,128,128,0.1)" }, beginAtZero: true },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Request Traffic</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>Requests per bucket</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[["#1D9E75","Success"],["#E24B4A","Errors"],["#BA7517","Rate limited"]].map(([c,l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-secondary)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", height: 180 }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

// ── ServicePanel ──────────────────────────────────────────────────
export function ServicePanel({ services }) {
  return (
    <div style={panel}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Services</div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 14 }}>Success rate & latency</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(services.length ? services : [
          { service: "user-service",    total: 0, errors: 0, avg_resp_ms: 0 },
          { service: "order-service",   total: 0, errors: 0, avg_resp_ms: 0 },
          { service: "product-service", total: 0, errors: 0, avg_resp_ms: 0 },
        ]).map(s => {
          const ok = s.total ? Math.round((s.total - s.errors) / s.total * 100) : 100;
          return (
            <div key={s.service}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: "var(--color-text-secondary)" }}>{s.service.replace("-service", "")}</span>
                <span style={{ fontFamily: "monospace", color: ok < 90 ? "#E24B4A" : "#1D9E75" }}>{ok}%</span>
              </div>
              <div style={{ height: 6, background: "var(--color-background-secondary)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${ok}%`, height: "100%", background: ok < 90 ? "#E24B4A" : "#1D9E75", transition: "width 0.5s" }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 3, fontFamily: "monospace" }}>
                {s.total.toLocaleString()} reqs · {Math.round(s.avg_resp_ms)}ms avg
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AnomalyFeed ───────────────────────────────────────────────────
const SEV_COLORS = {
  high:   { bg: "#FCEBEB", color: "#A32D2D", border: "#E24B4A" },
  medium: { bg: "#FAEEDA", color: "#633806", border: "#BA7517" },
  low:    { bg: "#E6F1FB", color: "#0C447C", border: "#378ADD" },
};

export function AnomalyFeed({ anomalies, onRefresh }) {
  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Anomaly Feed</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
            {anomalies.length} detected
          </div>
        </div>
        <button onClick={onRefresh} style={{ fontSize: 11, fontFamily: "monospace", padding: "4px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
          ↻ Refresh
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
        {anomalies.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "20px 0", textAlign: "center" }}>
            No anomalies detected
          </div>
        ) : anomalies.map((a, i) => {
          const c = SEV_COLORS[a.severity] || SEV_COLORS.low;
          return (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: 8, borderLeft: `3px solid ${c.border}`, fontSize: 12 }}>
              <span style={{ background: c.bg, color: c.color, fontSize: 9, fontWeight: 500, padding: "2px 6px", borderRadius: 4, height: "fit-content", flexShrink: 0, fontFamily: "monospace" }}>
                {a.severity}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{a.type?.replace(/_/g, " ")}</div>
                <div style={{ color: "var(--color-text-secondary)", lineHeight: 1.4 }}>{a.description}</div>
                {a.username && <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>user: {a.username}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── UsersTable ────────────────────────────────────────────────────
export function UsersTable({ users }) {
  return (
    <div style={panel}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Top Users</div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 14 }}>By request volume</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["User", "Requests", "Errors", "Rate limited", "Algo"].map(h => (
              <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", padding: "0 0 8px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(users.length ? users : []).map(u => (
            <tr key={u.username}>
              <td style={{ padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 500 }}>{u.username}</td>
              <td style={{ padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontFamily: "monospace" }}>{u.total?.toLocaleString()}</td>
              <td style={{ padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontFamily: "monospace", color: (u.errors/u.total*100)>10 ? "#E24B4A" : "inherit" }}>
                {Math.round(u.errors/u.total*100)}%
              </td>
              <td style={{ padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontFamily: "monospace" }}>{u.rate_limited}</td>
              <td style={{ padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                <span style={{ fontSize: 9, fontWeight: 500, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4, background: "#E6F1FB", color: "#185FA5" }}>
                  TB
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── BucketPanel ───────────────────────────────────────────────────
export function BucketPanel({ gwUsers, token, onUpdated }) {
  const [selected, setSelected] = useState(null);
  const [status,   setStatus]   = useState(null);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState({});
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!gwUsers?.length) return;
    setSelected(s => s || gwUsers[0]);
  }, [gwUsers]);

  useEffect(() => {
    if (!selected || !token) return;
    fetchRateLimitStatus(token, selected.id).then(setStatus).catch(() => {});
    const id = setInterval(() => {
      fetchRateLimitStatus(token, selected.id).then(setStatus).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [selected, token]);

  const startEdit = () => {
    setForm({
      capacity:   selected?.rateLimitCapacity   || 10,
      refillRate: selected?.rateLimitRefillRate || 5,
      algorithm:  selected?.rateLimitAlgorithm  || "TOKEN_BUCKET",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await updateRateLimit(token, selected.username, form);
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const tokens = status?.tokenBucketTokens ?? 0;
  const cap    = status?.tokenBucketCapacity ?? selected?.rateLimitCapacity ?? 10;
  const fillPct = Math.min(100, Math.round(tokens / cap * 100));

  return (
    <div style={{ ...panel, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Rate Limit Buckets</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>Live bucket levels · refreshes every 3s</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {gwUsers.map(u => (
            <button key={u.id} onClick={() => setSelected(u)}
              style={{ fontSize: 11, fontFamily: "monospace", padding: "4px 10px", borderRadius: 8, border: selected?.id === u.id ? "none" : "0.5px solid var(--color-border-tertiary)", background: selected?.id === u.id ? "#1D9E75" : "transparent", color: selected?.id === u.id ? "white" : "var(--color-text-secondary)", cursor: "pointer" }}>
              {u.username}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Bucket viz */}
        <div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 8 }}>
            {selected?.rateLimitAlgorithm === "LEAKY_BUCKET" ? "Leaky Bucket" : "Token Bucket"} — {selected?.username}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60, marginBottom: 8 }}>
            {Array.from({ length: cap }, (_, i) => (
              <div key={i} style={{ flex: 1, background: i < tokens ? "#1D9E75" : "var(--color-background-secondary)", borderRadius: "2px 2px 0 0", height: `${i < tokens ? 60 + Math.random()*20 : 15}%`, transition: "height 0.4s, background 0.3s" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace", color: "var(--color-text-secondary)", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 8 }}>
            <span>{tokens} / {cap} tokens</span>
            <span style={{ color: fillPct < 20 ? "#E24B4A" : fillPct < 50 ? "#BA7517" : "#1D9E75" }}>{fillPct}% full</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["Algorithm",  selected?.rateLimitAlgorithm],
            ["Capacity",   cap + " requests"],
            ["Refill rate", (selected?.rateLimitRefillRate || "—") + "/s"],
            ["Status",     tokens === 0 ? "exhausted" : tokens < 3 ? "low" : "healthy"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>{k}</span>
              <span style={{ fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Edit form */}
        <div>
          {!editing ? (
            <button onClick={startEdit} style={{ fontSize: 12, padding: "6px 14px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
              Edit rate limit
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>Capacity</label>
                <input type="number" value={form.capacity} onChange={e => setForm(f => ({...f, capacity: +e.target.value}))} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>Rate (req/s)</label>
                <input type="number" value={form.refillRate} onChange={e => setForm(f => ({...f, refillRate: +e.target.value}))} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>Algorithm</label>
                <select value={form.algorithm} onChange={e => setForm(f => ({...f, algorithm: e.target.value}))} style={{ width: "100%" }}>
                  <option value="TOKEN_BUCKET">Token Bucket</option>
                  <option value="LEAKY_BUCKET">Leaky Bucket</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={saveEdit} disabled={saving} style={{ fontSize: 12, padding: "5px 12px", background: "#1D9E75", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={() => setEditing(false)} style={{ fontSize: 12, padding: "5px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── LogsDrawer ────────────────────────────────────────────────────
export function LogsDrawer({ token, onClose }) {
  const [logs, setLogs]     = useState([]);
  const [page, setPage]     = useState(0);
  const [total, setTotal]   = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (p = 0, u = "") => {
    setLoading(true);
    try {
      const data = await fetchLogs(token, { page: p, size: 50, username: u || undefined });
      setLogs(data.content || []);
      setTotal(data.totalElements || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0, filter); }, []);

  const STATUS_COLOR = code => code >= 500 ? "#E24B4A" : code >= 400 ? "#BA7517" : code === 429 ? "#BA7517" : "#1D9E75";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 700, background: "var(--color-background-primary)", height: "100%", overflowY: "auto", padding: "1.5rem" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: 16, fontWeight: 500 }}>Request Logs</h2>
          <button onClick={onClose} style={{ fontSize: 14, border: "none", background: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input placeholder="Filter by username…" value={filter} onChange={e => setFilter(e.target.value)} style={{ flex: 1 }} />
          <button onClick={() => { setPage(0); load(0, filter); }} style={{ padding: "6px 14px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer" }}>
            Search
          </button>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "2rem 0", textAlign: "center" }}>Loading…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                {["Time","User","Method","Path","Status","RT","Service"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", padding: "0 6px 8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ padding: "6px 6px 6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>
                    {new Date(l.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: "6px 6px 6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 500 }}>{l.username}</td>
                  <td style={{ padding: "6px 6px 6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontFamily: "monospace" }}>{l.method}</td>
                  <td style={{ padding: "6px 6px 6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontFamily: "monospace", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{l.path}</td>
                  <td style={{ padding: "6px 6px 6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontFamily: "monospace", color: STATUS_COLOR(l.statusCode), fontWeight: 500 }}>{l.statusCode}</td>
                  <td style={{ padding: "6px 6px 6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>{l.responseTimeMs}ms</td>
                  <td style={{ padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>{l.targetService}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, fontSize: 12, color: "var(--color-text-secondary)" }}>
          <span>{total.toLocaleString()} total logs</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={page === 0} onClick={() => { setPage(p => p-1); load(page-1, filter); }} style={{ padding: "4px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer" }}>← Prev</button>
            <span style={{ lineHeight: "28px" }}>Page {page+1}</span>
            <button onClick={() => { setPage(p => p+1); load(page+1, filter); }} style={{ padding: "4px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, background: "transparent", cursor: "pointer" }}>Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
