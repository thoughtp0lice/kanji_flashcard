import { useState } from "react";
import { login, register } from "../api.js";

const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;

export default function Login({ onLogin }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const normalized = name.trim().toLowerCase();
  const ok = USERNAME_RE.test(normalized) && password.length >= 4;

  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    try {
      const fn = creating ? register : login;
      const { token, username } = await fn(normalized, password);
      onLogin(username, token);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "server unreachable" : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-glyph" lang="ja">
        漢
      </div>
      <form className="login-form login-form-stacked" onSubmit={submit}>
        <input
          autoFocus
          placeholder="username"
          value={name}
          maxLength={32}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          autoComplete={creating ? "new-password" : "current-password"}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="primary-btn" disabled={!ok || busy}>
          {busy ? "…" : creating ? "create account" : "log in"}
        </button>
      </form>
      <p className="login-hint login-error">{error}</p>
      <button
        className="ghost-btn"
        onClick={() => {
          setCreating((c) => !c);
          setError("");
        }}
      >
        {creating ? "have an account? log in" : "new here? create an account"}
      </button>
    </div>
  );
}
