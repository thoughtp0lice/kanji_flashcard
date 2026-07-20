import { useState } from "react";
import Study from "./Study.jsx";
import Login from "./components/Login.jsx";
import { logout } from "./api.js";

const USER_KEY = "joyo-kanji-user";
const TOKEN_KEY = "joyo-kanji-token";
const LEGACY_KNOWN = "joyo-kanji-known";
const LEGACY_PREFS = "joyo-kanji-prefs";

// progress saved before accounts existed is adopted by the first
// username that logs in on this device
function migrateLegacy(user) {
  const legacyKnown = localStorage.getItem(LEGACY_KNOWN);
  if (legacyKnown) {
    const key = `${LEGACY_KNOWN}:${user}`;
    try {
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      const merged = [...new Set([...existing, ...JSON.parse(legacyKnown)])];
      localStorage.setItem(key, JSON.stringify(merged));
    } catch {}
    localStorage.removeItem(LEGACY_KNOWN);
  }
  const legacyPrefs = localStorage.getItem(LEGACY_PREFS);
  if (legacyPrefs) {
    const key = `${LEGACY_PREFS}:${user}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, legacyPrefs);
    localStorage.removeItem(LEGACY_PREFS);
  }
}

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem(USER_KEY));
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  const handleLogin = (username, newToken) => {
    migrateLegacy(username);
    localStorage.setItem(USER_KEY, username);
    localStorage.setItem(TOKEN_KEY, newToken);
    setUser(username);
    setToken(newToken);
  };

  const signOut = () => {
    if (token) logout(token);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
  };

  if (!user || !token) return <Login onLogin={handleLogin} />;
  // key: switching user remounts the whole study screen with fresh state
  return <Study key={user} user={user} token={token} onSignOut={signOut} />;
}
