import { useState, useEffect, useCallback } from "react";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gw_token"));
  const [user, setUser]   = useState(() => localStorage.getItem("gw_user"));

  const handleLogin = (jwt, username) => {
    localStorage.setItem("gw_token", jwt);
    localStorage.setItem("gw_user", username);
    setToken(jwt);
    setUser(username);
  };

  const handleLogout = () => {
    localStorage.removeItem("gw_token");
    localStorage.removeItem("gw_user");
    setToken(null);
    setUser(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;
  return <Dashboard token={token} username={user} onLogout={handleLogout} />;
}
