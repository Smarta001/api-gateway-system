import { useState } from "react";
import { login } from "../api";

export function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await login(username, password);
      onLogin(data.token, data.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)" }}>
      <div style={{ width: 360, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: "2rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ width: 40, height: 40, background: "#1D9E75", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="6" width="12" height="8" rx="2" fill="white" opacity="0.9"/>
              <path d="M5 6V4a3 3 0 016 0v2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="10" r="1.5" fill="#1D9E75"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Gateway Admin</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>Sign in with your admin credentials</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Username</label>
            <input
              value={username} onChange={e => setUsername(e.target.value)}
              style={{ width: "100%" }} placeholder="admin"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: "100%" }} placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{ background: "#FCEBEB", color: "#A32D2D", fontSize: 12, padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ width: "100%", background: "#1D9E75", color: "white", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", textAlign: "center", marginTop: 16 }}>
          Default: admin / admin123
        </p>
      </div>
    </div>
  );
}
