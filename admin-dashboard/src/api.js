const GATEWAY_URL  = import.meta.env.VITE_GATEWAY_URL  || "";
const ANALYTICS_URL = import.meta.env.VITE_ANALYTICS_URL || "";

export async function login(username, password) {
  const res = await fetch(`${GATEWAY_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  return res.json();
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function fetchDashboard(token) {
  const res = await fetch(`${GATEWAY_URL}/admin/dashboard`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to fetch dashboard");
  return res.json();
}

export async function fetchLogs(token, { page = 0, size = 50, username } = {}) {
  const params = new URLSearchParams({ page, size });
  if (username) params.set("username", username);
  const res = await fetch(`${GATEWAY_URL}/admin/logs?${params}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

export async function fetchUsers(token) {
  const res = await fetch(`${GATEWAY_URL}/admin/users`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function updateRateLimit(token, username, { capacity, refillRate, algorithm }) {
  const res = await fetch(`${GATEWAY_URL}/admin/users/${username}/rate-limit`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ capacity, refillRate, algorithm }),
  });
  if (!res.ok) throw new Error("Failed to update rate limit");
  return res.json();
}

export async function fetchRateLimitStatus(token, userId) {
  const res = await fetch(`${GATEWAY_URL}/admin/rate-limit/status/${userId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch rate limit status");
  return res.json();
}

export async function fetchSummary(minutes = 60) {
  const res = await fetch(`${ANALYTICS_URL}/summary?minutes=${minutes}`);
  if (!res.ok) throw new Error("Analytics unavailable");
  return res.json();
}

export async function fetchTimeseries(minutes = 60, bucketSeconds = 60) {
  const res = await fetch(`${ANALYTICS_URL}/timeseries?minutes=${minutes}&bucket_seconds=${bucketSeconds}`);
  if (!res.ok) throw new Error("Timeseries unavailable");
  return res.json();
}

export async function fetchServiceStats(minutes = 60) {
  const res = await fetch(`${ANALYTICS_URL}/services?minutes=${minutes}`);
  if (!res.ok) throw new Error("Service stats unavailable");
  return res.json();
}

export async function fetchUserStats(minutes = 60, topN = 20) {
  const res = await fetch(`${ANALYTICS_URL}/users?minutes=${minutes}&top_n=${topN}`);
  if (!res.ok) throw new Error("User stats unavailable");
  return res.json();
}

export async function fetchAnomalies(minutes = 60) {
  const res = await fetch(`${ANALYTICS_URL}/anomalies?minutes=${minutes}`);
  if (!res.ok) throw new Error("Anomaly detection unavailable");
  return res.json();
}

export async function fetchLatestAnomalies() {
  const res = await fetch(`${ANALYTICS_URL}/anomalies/latest`);
  if (!res.ok) throw new Error("Anomaly feed unavailable");
  return res.json();
}
