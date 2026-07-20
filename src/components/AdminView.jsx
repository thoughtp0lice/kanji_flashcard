import { useEffect, useState } from "react";
import { adminDeleteUser, adminOverview } from "../api.js";

export default function AdminView({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setData(await adminOverview(token));
      setError("");
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "server unreachable" : err.message);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const removeUser = async (name) => {
    if (!confirm(`Delete user "${name}" and all their progress?`)) return;
    try {
      await adminDeleteUser(token, name);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <main className="admin"><p className="empty-msg">{error}</p></main>;
  if (!data) return <main className="admin"><p className="empty-msg">loading…</p></main>;

  return (
    <main className="admin">
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-num">{data.totalUsers}</span>
          <span className="admin-stat-label">users</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-num">{data.activeToday}</span>
          <span className="admin-stat-label">active today</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-num">{data.visitsToday}</span>
          <span className="admin-stat-label">visits today</span>
        </div>
      </div>

      <p className="setup-title">last 14 days</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>date</th>
            <th>visits</th>
            <th>active</th>
          </tr>
        </thead>
        <tbody>
          {data.byDay.length === 0 && (
            <tr>
              <td colSpan={3} className="admin-empty">no visits yet</td>
            </tr>
          )}
          {data.byDay.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.visits}</td>
              <td>{d.active}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="setup-title">users</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>user</th>
            <th>joined</th>
            <th>last seen</th>
            <th>seen</th>
            <th>known</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.users.map((u) => (
            <tr key={u.username}>
              <td>
                {u.username}
                {u.admin && <span className="admin-badge">admin</span>}
              </td>
              <td>{u.created}</td>
              <td>{u.lastSeen ?? "—"}</td>
              <td>{u.seen}</td>
              <td>{u.known}</td>
              <td>
                {!u.admin && (
                  <button
                    className="ghost-btn admin-delete"
                    onClick={() => removeUser(u.username)}
                    aria-label={`Delete ${u.username}`}
                  >
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
